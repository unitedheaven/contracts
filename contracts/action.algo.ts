import { Contract } from '@algorandfoundation/tealscript';

const TWO_WEEKS_IN_SECONDS = 2 * 7 * 24 * 60 * 60;

type dispenseRecord = {
    amount: uint64;
    description: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Action extends Contract {
    /**
     * Token ID for USDC on testnet.
     * For mainnet deployment, change to the actual asset ID of USDC.
     */
    tokenAsset = GlobalStateKey<Asset>({ key: 'ta' });

    // The goal amount for the action in USDC
    goal = GlobalStateKey<uint64>({ key: 'g' });

    // Total amount of donations received
    totalDonations = GlobalStateKey<uint64>({ key: 'td' });

    // Mapping of donor addresses to their donation amounts
    donations = BoxMap<Address, uint64>();

    // Start date of the action (unix timestamp)
    startDate = GlobalStateKey<uint64>({ key: 'sd' });

    // End date of the action (unix timestamp)
    endDate = GlobalStateKey<uint64>({ key: 'ed' });

    // Minimum donation amount required
    minDonationAmount = GlobalStateKey<uint64>({ key: 'mda' });

    // Records of funds dispensed from the contract
    dispenseRecords = BoxMap<uint64, dispenseRecord>({ prefix: 'dr' });

    // Available balance in the contract for dispensing
    availableBalance = GlobalStateKey<uint64>({ key: 'ab' });

    /**
     * Initializes the smart contract with default values.
     * Sets the USDC token to zero index initially.
     */
    createApplication(): void {
        this.tokenAsset.value = Asset.zeroIndex;
        this.goal.value = 0;
        this.totalDonations.value = 0;
        this.availableBalance.value = 0;
        this.startDate.value = 0;
        this.endDate.value = 0;

        /** minimum donation amount in USDC (0.01 USDC) to prevent min-balance attack */
        this.minDonationAmount.value = 10000;
    }

    /**
     * Internal function to transfer assets.
     * @param {Account} receiver - The account receiving the asset.
     * @param {Asset} asset - The asset to be transferred.
     * @param {uint64} amount - The amount of the asset to transfer.
     */
    private doAxfer(receiver: Account, asset: Asset, amount: uint64): void {
        sendAssetTransfer({
            assetReceiver: receiver,
            xferAsset: asset,
            assetAmount: amount,
        });
    }

    /**
     * Internal function to opt into an asset.
     * Used for the contract to opt into the USDC token or other assets.
     * @param {Asset} asset - The asset to opt into.
     */
    private doOptIn(asset: Asset): void {
        this.doAxfer(this.app.address, asset, 0);
    }

    /**
     * Check if the sender is the governance address.
     * Used to restrict access to certain functions like changing the token asset.
     * @returns {boolean} - True if the sender is the governance address, false otherwise.
     */
    private isGovernance(sender: Address): boolean {
        // ! change this to governance address before deploying to testnet/mainnet
        return (
            sender ===
            addr('KTFB3FYITSXK7AMABHBME2DTHG37W32O72B3LQIWNTLELCKQYOFUNP2Y5E')
        ); // Replace with actual governance address
    }

    /**
     * Sets up the initial configuration of the action.
     * Validates the start and end dates, and the goal amount.
     * @param {uint64} startDate - The start date of the action (unix timestamp).
     * @param {uint64} endDate - The end date of the action (unix timestamp).
     * @param {uint64} goal - The goal amount for the action in USDC.
     */
    bootstrap(startDate: uint64, endDate: uint64, goal: uint64): void {
        verifyTxn(this.txn, { sender: this.app.creator });

        assert(this.tokenAsset.value === Asset.zeroIndex); // Ensure no ASA has been opted into yet
        assert(startDate < endDate); // Start date must be before end date
        assert(startDate > globals.latestTimestamp); // Start date must be in the future
        assert(goal > 0); // Goal amount must be greater than zero

        this.startDate.value = startDate;
        this.endDate.value = endDate;
        this.goal.value = goal;

        // * tokenAsset is set to testnet USDC. change to 31566704 for mainnet USDC
        const tokenAsset = Asset.fromID(10458941);

        // ! comment this only during local development
        // ! uncomment this before deploying to testnet/mainnet
        // this.doOptIn(tokenAsset);
        this.tokenAsset.value = tokenAsset;
    }

    /**
     * Changes the token asset associated with the contract.
     * This function is intended for use by the governance address.
     * @param {Asset} newTokenAsset - The new asset to be associated with the contract.
     */
    changeTokenAsset(newTokenAsset: Asset): void {
        // ! comment this only during local development
        // assert(this.isGovernance(this.txn.sender));
        this.doOptIn(newTokenAsset);
        this.tokenAsset.value = newTokenAsset;
    }

    /**
     * Changes the minimum donation amount required to participate in the action.
     * This function can only be called by the contract creator.
     * @param {uint64} newMinDonationAmount - The new minimum donation amount in USDC.
     */
    changeMinDonationAmount(newMinDonationAmount: uint64): void {
        verifyTxn(this.txn, { sender: this.app.creator });
        this.minDonationAmount.value = newMinDonationAmount;
    }

    /**
     * Allows a user to donate to the action.
     * Validates the donation amount and updates the total donations and available balance.
     * @param {AssetTransferTxn} donation - The donation transaction.
     */
    donate(donation: AssetTransferTxn): void {
        assert(globals.latestTimestamp < this.startDate.value); // Donation is only allowed before the end date
        verifyTxn(donation, {
            assetAmount: { greaterThan: this.minDonationAmount.value },
            assetReceiver: this.app.address,
            sender: this.txn.sender,
            xferAsset: this.tokenAsset.value,
        });

        let currentDonation: uint64;

        if (this.donations(this.txn.sender).exists) {
            currentDonation = this.donations(this.txn.sender).value;
        } else {
            currentDonation = 0;
        }

        this.donations(this.txn.sender).value =
            currentDonation + donation.assetAmount;

        // Update total donations
        this.totalDonations.value =
            this.totalDonations.value + donation.assetAmount;
        this.availableBalance.value =
            this.availableBalance.value + donation.assetAmount;
    }

    /**
     * Dispenses funds from the contract for the specified purpose.
     * This function can only be called by the contract creator.
     * @param {number} amount - The amount of funds to dispense.
     * @param {string} description - Description of the purpose for dispensing funds.
     * @param {uint64} id - Unique identifier for the dispense record.
     * @param {Asset} transferToken - The asset to be dispensed.
     */
    dispense(
        amount: number,
        description: string,
        id: uint64,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        transferToken: Asset,
    ): void {
        verifyTxn(this.txn, { sender: this.app.creator });
        assert(this.availableBalance.value >= amount); // Ensure enough balance is available for dispensing
        assert(
            globals.latestTimestamp < this.endDate.value + TWO_WEEKS_IN_SECONDS,
        );
        this.doAxfer(this.txn.sender, this.tokenAsset.value, amount);
        this.availableBalance.value = this.availableBalance.value - amount;
        const dispenseRecord: dispenseRecord = {
            amount: amount,
            description: description,
        };
        this.dispenseRecords(id).value = dispenseRecord;
    }

    /**
     * Recollects remaining funds after the end of the campaign.
     * This function can only be called by the governance address after a specific period post campaign end.
     * @param {Address} receiver - The address to receive the recollected funds.
     * @param {Asset} transferToken - The asset to be recollected.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    recollect(receiver: Address, transferToken: Asset): void {
        // ! comment this only during local development
        // assert(this.isGovernance(this.txn.sender));
        assert(
            globals.latestTimestamp > this.endDate.value + TWO_WEEKS_IN_SECONDS,
        ); // Ensure the waiting period has passed
        this.doAxfer(
            receiver,
            this.tokenAsset.value,
            this.availableBalance.value,
        );
        this.availableBalance.value = 0; // Reset the available balance
    }
}
