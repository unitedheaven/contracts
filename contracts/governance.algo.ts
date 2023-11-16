import { Contract } from '@algorandfoundation/tealscript';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Governance extends Contract {
    // United (UNI) Token ID
    uniToken = GlobalStateKey<Asset>({ key: 'uni' });

    // Governance Address
    governor = GlobalStateKey<Address>({ key: 'g' });

    // Voting token rate
    votingTokenRate = GlobalStateKey<uint64>({ key: 'vtr' });

    // Divisor for scale adjustment
    divisor = GlobalStateKey<uint64>({ key: 'div' });

    // Stake Record
    // Flattened array of uint64 where even indices are amounts and odd indices are end timestamps
    stakes = BoxMap<Address, uint64[]>({ prefix: 's' });

    // Voting tokens issued to the user
    userVotingTokens = BoxMap<Address, uint64>({ prefix: 'vt' });

    // Voting given to a action
    actionVotes = BoxMap<uint64, uint64>(); // Action ID to votes

    // Rewards for a project
    projectRewards = BoxMap<uint64, uint64>({ prefix: 'r' }); // Project ID to rewards

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
     * Initializes the smart contract and sets initial values.
     */
    createApplication(): void {
        this.governor.value = this.txn.sender;
        this.uniToken.value = Asset.zeroIndex;
        this.votingTokenRate.value = 1;
        this.divisor.value = 1;
    }

    /**
     * Bootstraps the smart contract with UNI token asset and opts in.
     * @param {Asset} uniToken - The UNI token asset.
     */
    bootstrap(uniToken: Asset): void {
        verifyTxn(this.txn, { sender: this.governor.value }); // Ensure only governance can bootstrap
        assert(this.uniToken.value === Asset.zeroIndex); // Ensure the contract has not been bootstrapped
        this.uniToken.value = uniToken;
        this.doOptIn(uniToken);
    }

    /**
     * Stakes UNI tokens and calculates voting tokens based on the amount and duration.
     * @param {AssetTransferTxn} axfer - The asset transfer transaction.
     * @param {uint64} period - The end timestamp for the staking period.
     * @returns {uint64} The updated voting token balance for the user.
     */
    stake(axfer: AssetTransferTxn, period: uint64): uint64 {
        assert(globals.latestTimestamp < period); // Ensure the stake period is in the future

        verifyTxn(axfer, {
            sender: this.txn.sender,
            assetAmount: { greaterThan: 0 },
            assetReceiver: this.app.address,
            xferAsset: this.uniToken.value,
        });

        // Record the stake
        if (this.stakes(this.txn.sender).exists) {
            this.stakes(this.txn.sender).value.push(axfer.assetAmount, period);
        } else {
            this.stakes(this.txn.sender).value = [axfer.assetAmount, period];
        }

        // Calculate the duration in days from the current timestamp to the end period
        const durationInDays = (period - globals.latestTimestamp) / 86400; // Convert from seconds to days

        // Calculate voting tokens
        const votingTokens =
            (axfer.assetAmount * durationInDays * this.votingTokenRate.value) /
            this.divisor.value;

        // Update user's voting token balance
        this.userVotingTokens(this.txn.sender).value =
            this.userVotingTokens(this.txn.sender).value + votingTokens;

        // return votingTokens;
        return this.userVotingTokens(this.txn.sender).value;
    }

    /**
     * Unstakes UNI tokens and adjusts the user's voting token balance.
     */
    unstake(): void {
        const stakesArray = this.stakes(this.txn.sender).value;
        for (let i = 0; i < stakesArray.length; i += 2) {
            const amount = stakesArray[i];
            const endTimestamp = stakesArray[i + 1];
            assert(globals.latestTimestamp > endTimestamp); // Ensure the stake duration has passed

            // Return staked UNI tokens to the user
            this.doAxfer(this.txn.sender, this.uniToken.value, amount);

            // Adjust voting tokens balance
            const durationInDays =
                (endTimestamp - globals.latestTimestamp) / 86400; // Convert from seconds to days
            const votingTokensToDeduct =
                (amount * durationInDays * this.votingTokenRate.value) /
                this.divisor.value;

            this.userVotingTokens(this.txn.sender).value -=
                votingTokensToDeduct;
        }

        // Clear the user's stakes
        this.stakes(this.txn.sender).delete();
    }

    /**
     * Records votes for a given project.
     * @param {uint64} projectId - The ID of the project being voted on.
     * @param {uint64} votes - The number of votes to cast.
     */
    vote(projectId: uint64, votes: uint64): void {
        assert(this.userVotingTokens(this.txn.sender).value >= votes); // Ensure the user has enough voting tokens

        // Record the votes for the project
        this.actionVotes(projectId).value += votes;

        // Update user's voting token balance
        this.userVotingTokens(this.txn.sender).value -= votes;
    }

    /**
     * Allows users to claim their rewards for a specific project.
     * @param {uint64} projectId - The ID of the project to claim rewards for.
     */
    claimRewards(projectId: uint64): void {
        assert(this.projectRewards(projectId).exists); // Ensure rewards are available for the project
        const rewards = this.projectRewards(projectId).value;

        // Transfer rewards to the user
        this.doAxfer(this.txn.sender, this.uniToken.value, rewards);

        // Optionally, update or delete the reward record
        this.projectRewards(projectId).delete(); // or adjust the value accordingly
    }

    /**
     * Updates the governance address.
     * @param {Account} governor - The new governance account.
     */
    setGovernor(governor: Account): void {
        verifyTxn(this.txn, { sender: this.governor.value });
        this.governor.value = governor;
    }

    /**
     * Function to update the voting token rate and divisor.
     * @param {uint64} newRate - The new voting token rate.
     * @param {uint64} newDivisor - The new divisor.
     */
    updateVotingTokenRateAndDivisor(newRate: uint64, newDivisor: uint64): void {
        verifyTxn(this.txn, { sender: this.governor.value }); // Ensure only governance can update
        this.votingTokenRate.value = newRate;
        this.divisor.value = newDivisor;
    }
}
