import { Contract } from '@algorandfoundation/tealscript'

const TWO_WEEKS_IN_SECONDS = 2 * 7 * 24 * 60 * 60

type dispenseRecord = {
    amount: uint64
    description: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Action extends Contract {
    // Token ID (USDC = 10458941)
    tokenAsset = GlobalStateKey<Asset>({ key: 'ta' })

    // Action Details
    goal = GlobalStateKey<uint64>({ key: 'g' })
    totalDonations = GlobalStateKey<uint64>({ key: 'td' })
    donations = BoxMap<Address, uint64>()
    startDate = GlobalStateKey<uint64>({ key: 'sd' })
    endDate = GlobalStateKey<uint64>({ key: 'ed' })
    minDonationAmount = GlobalStateKey<uint64>({ key: 'mda' })
    dispenseRecords = BoxMap<uint64, dispenseRecord>({ prefix: 'dr' })
    availableBalance = GlobalStateKey<uint64>({ key: 'ab' })

    createApplication(): void {
        this.tokenAsset.value = Asset.zeroIndex
        this.goal.value = 0
        this.totalDonations.value = 0
        this.availableBalance.value = 0
        this.startDate.value = 0
        this.endDate.value = 0

        /** minimum donation amount in USDC (0.01 USDC) to prevent min-balance attack */
        this.minDonationAmount.value = 10000
    }

    private doAxfer(receiver: Account, asset: Asset, amount: uint64): void {
        sendAssetTransfer({
            assetReceiver: receiver,
            xferAsset: asset,
            assetAmount: amount,
        })
    }

    private doOptIn(asset: Asset): void {
        this.doAxfer(this.app.address, asset, 0)
    }

    private isGovernance(sender: Address): boolean {
        // ! change this to governance address before deploying to testnet/mainnet
        return (
            sender ===
            addr('KTFB3FYITSXK7AMABHBME2DTHG37W32O72B3LQIWNTLELCKQYOFUNP2Y5E')
        )
    }

    bootstrap(startDate: uint64, endDate: uint64, goal: uint64): void {
        verifyTxn(this.txn, { sender: this.app.creator })

        /** Verify a ASA hasn't already been opted into */
        assert(this.tokenAsset.value === Asset.zeroIndex)

        assert(startDate < endDate)
        assert(startDate > globals.latestTimestamp)
        assert(goal > 0)

        this.startDate.value = startDate
        this.endDate.value = endDate
        this.goal.value = goal

        // * tokenAsset is set to testnet USDC. change to 31566704 for mainnet USDC
        const tokenAsset = Asset.fromID(10458941)

        // ! comment this only during local development
        // ! uncomment this before deploying to testnet/mainnet
        // this.doOptIn(tokenAsset);
        this.tokenAsset.value = tokenAsset
    }

    changeTokenAsset(newTokenAsset: Asset): void {
        // ! comment this only during local development
        // assert(this.isGovernance(this.txn.sender));
        this.doOptIn(newTokenAsset)
        this.tokenAsset.value = newTokenAsset
    }

    changeMinDonationAmount(newMinDonationAmount: uint64): void {
        verifyTxn(this.txn, { sender: this.app.creator })
        this.minDonationAmount.value = newMinDonationAmount
    }

    donate(donation: AssetTransferTxn): void {
        assert(globals.latestTimestamp < this.startDate.value)
        verifyTxn(donation, {
            assetAmount: { greaterThan: this.minDonationAmount.value },
            assetReceiver: this.app.address,
            sender: this.txn.sender,
            xferAsset: this.tokenAsset.value,
        })

        let currentDonation: uint64

        if (this.donations(this.txn.sender).exists) {
            currentDonation = this.donations(this.txn.sender).value
        } else {
            currentDonation = 0
        }

        this.donations(this.txn.sender).value =
            currentDonation + donation.assetAmount

        // Update total donations
        this.totalDonations.value =
            this.totalDonations.value + donation.assetAmount
        this.availableBalance.value =
            this.availableBalance.value + donation.assetAmount
    }

    dispense(
        amount: number,
        description: string,
        id: uint64,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        transferToken: Asset,
    ): void {
        verifyTxn(this.txn, { sender: this.app.creator })
        assert(this.availableBalance.value >= amount)
        assert(
            globals.latestTimestamp < this.endDate.value + TWO_WEEKS_IN_SECONDS,
        )
        this.doAxfer(this.txn.sender, this.tokenAsset.value, amount)
        this.availableBalance.value = this.availableBalance.value - amount
        const dispenseRecord: dispenseRecord = {
            amount: amount,
            description: description,
        }
        this.dispenseRecords(id).value = dispenseRecord
    }

    // recollect remaining funds after 2 weeks of campaign end
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    recollect(receiver: Address, transferToken: Asset): void {
        // ! comment this only during local development
        // assert(this.isGovernance(this.txn.sender));
        assert(
            globals.latestTimestamp > this.endDate.value + TWO_WEEKS_IN_SECONDS,
        )
        this.doAxfer(
            receiver,
            this.tokenAsset.value,
            this.availableBalance.value,
        )
        this.availableBalance.value = 0
    }
}
