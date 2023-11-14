import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals'
import algosdk, { decodeAddress, decodeUint64 } from 'algosdk'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import {
    algos,
    microAlgos,
    getOrCreateKmdWalletAccount,
} from '@algorandfoundation/algokit-utils'
import { ActionClient } from '../contracts/clients/action'
import {
    AppMetadata,
    AppReference,
} from '@algorandfoundation/algokit-utils/types/app'

import createToken from '../contracts/lib/createToken'
import optInToAsset from '../contracts/lib/optInToAsset'
import assetTransfer from '../contracts/lib/assetTransfer'

const fixture = algorandFixture()

let appClient: ActionClient
let fakeUSDCToken: number
let appRef: AppMetadata | AppReference
let deployerAccount: algosdk.Account
let actionCreatorAccount: algosdk.Account
let donorAccount: algosdk.Account
let algod: algosdk.Algodv2
const USDCBaseUnitMultiplier = 10 ** 6

describe('Action', () => {
    beforeEach(fixture.beforeEach)

    beforeAll(async () => {
        await fixture.beforeEach()
        const { kmd } = fixture.context
        algod = fixture.context.algod

        /** Create contract deployer account */
        deployerAccount = await getOrCreateKmdWalletAccount(
            {
                name: 'uh-action-deployer',
                fundWith: algos(10),
            },
            algod,
            kmd,
        )

        /** Create action creator account */
        actionCreatorAccount = await getOrCreateKmdWalletAccount(
            {
                name: 'uh-action-creator',
                fundWith: algos(10),
            },
            algod,
            kmd,
        )

        /** Create donor account */
        donorAccount = await getOrCreateKmdWalletAccount(
            {
                name: 'uh-action-donator',
                fundWith: algos(10),
            },
            algod,
            kmd,
        )

        /** Create action client */
        appClient = new ActionClient(
            {
                sender: deployerAccount,
                resolveBy: 'id',
                id: 0,
            },
            algod,
        )

        /** Create USDC token in localnet */
        fakeUSDCToken = await createToken({
            account: deployerAccount,
            name: 'USDC',
            algod,
        })

        /** Opt In donator to USDC token */
        await optInToAsset({
            account: donorAccount,
            assetIndex: fakeUSDCToken,
            algod,
        })

        /** Opt In creator to USDC token */
        await optInToAsset({
            account: actionCreatorAccount,
            assetIndex: fakeUSDCToken,
            algod,
        })

        /** Transfer USDC to Donator */
        await assetTransfer({
            algod,
            amount: 10000 * USDCBaseUnitMultiplier,
            assetIndex: fakeUSDCToken,
            from: deployerAccount,
            to: donorAccount.addr,
        })

        await appClient.create.createApplication(
            {},
            {
                sender: actionCreatorAccount,
            },
        )

        appRef = await appClient.appClient.getAppReference()

        /** fund app with algos */
        await appClient.appClient.fundAppAccount(microAlgos(400_000))

        console.table([
            ['tokenAsset', fakeUSDCToken],
            ['app address', appRef.appAddress],
            ['deployer address', deployerAccount.addr],
            ['actionCreator address', actionCreatorAccount.addr],
            ['donor address', donorAccount.addr],
        ])
    }, 15_000)

    test('token asset is a zero index', async () => {
        const { ta } = await appClient.getGlobalState()
        expect(ta?.asBigInt()).toBe(BigInt(0))
    })

    test('donorAccount has 10000 USDC', async () => {
        const accountInfo = await algod
            .accountAssetInformation(donorAccount.addr, fakeUSDCToken)
            .do()
        expect(accountInfo['asset-holding'].amount).toBe(
            10000 * USDCBaseUnitMultiplier,
        )
    })

    test('Bootstrap fails if not called by action creator', async () => {
        // convert start date and end date to unix timestamp
        const startDate = Math.floor(
            new Date('2034-11-10T07:36:44Z').getTime() / 1000,
        )
        const endDate = Math.floor(
            new Date('2035-11-20T07:36:44Z').getTime() / 1000,
        )

        await expect(
            appClient.bootstrap(
                {
                    endDate,
                    goal: 2000 * USDCBaseUnitMultiplier,
                    startDate,
                },
                {
                    sender: deployerAccount,
                    sendParams: {
                        fee: microAlgos(2_000),
                    },
                },
            ),
        ).rejects.toThrow()
    })

    test('Bootstrap sucessfully sets the values', async () => {
        const goalAmount = 2000 * USDCBaseUnitMultiplier

        // convert start date and end date to unix timestamp
        const startDate = Math.floor(
            new Date('2034-11-10T07:36:44Z').getTime() / 1000,
        )
        const endDate = Math.floor(
            new Date('2035-11-20T07:36:44Z').getTime() / 1000,
        )

        await appClient.bootstrap(
            {
                endDate,
                goal: goalAmount,
                startDate,
            },
            {
                sender: actionCreatorAccount,
                sendParams: {
                    fee: microAlgos(2_000),
                },
            },
        )

        const {
            g: goal,
            td: totalDonations,
            sd: startDateFC,
            ed: endDateFC,
        } = await appClient.getGlobalState()

        expect(goal?.asNumber()).toEqual(goalAmount)
        expect(totalDonations?.asNumber()).toEqual(0)
        expect(startDateFC?.asNumber()).toEqual(startDate)
        expect(endDateFC?.asNumber()).toEqual(endDate)
    })

    test('Token asset is set correctly to USDC token', async () => {
        const { ta } = await appClient.getGlobalState()
        expect(ta?.asBigInt()).toBe(BigInt(10458941))
    })

    // ! unskip this later
    test.skip('Change token asset fails if not called by governance', async () => {
        await expect(
            appClient.changeTokenAsset(
                {
                    newTokenAsset: fakeUSDCToken,
                },
                {
                    sender: actionCreatorAccount,
                    sendParams: {
                        fee: microAlgos(2_000),
                    },
                },
            ),
        ).rejects.toThrow()
    })

    test('Change token asset to Fake USDC token for testing', async () => {
        await appClient.changeTokenAsset(
            {
                newTokenAsset: fakeUSDCToken,
            },
            {
                sender: deployerAccount,
                sendParams: {
                    fee: microAlgos(2_000),
                },
            },
        )

        const { ta } = await appClient.getGlobalState()
        expect(ta?.asBigInt()).toBe(BigInt(fakeUSDCToken))
    })

    test('Donation fails if amount is less than minDonationAmount', async () => {
        const donationTnx =
            algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                from: donorAccount.addr,
                to: appRef.appAddress,
                amount: 100,
                assetIndex: fakeUSDCToken,
                suggestedParams: await algod.getTransactionParams().do(),
            })

        const boxRef: algosdk.BoxReference[] = [
            {
                appIndex: Number(appRef.appId),
                name: decodeAddress(donorAccount.addr).publicKey,
            },
        ]

        donationTnx.signTxn(donorAccount.sk)

        await expect(
            appClient.donate(
                {
                    donation: donationTnx,
                },
                {
                    sender: donorAccount,
                    boxes: boxRef,
                },
            ),
        ).rejects.toThrow()
    })

    test('Donation increases total donations and sets donations map', async () => {
        const amountToDonate = 50 * USDCBaseUnitMultiplier

        const donationTnx =
            algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                from: donorAccount.addr,
                to: appRef.appAddress,
                amount: amountToDonate,
                assetIndex: fakeUSDCToken,
                suggestedParams: await algod.getTransactionParams().do(),
            })

        const boxRef: algosdk.BoxReference[] = [
            {
                appIndex: Number(appRef.appId),
                name: decodeAddress(donorAccount.addr).publicKey,
            },
        ]

        donationTnx.signTxn(donorAccount.sk)

        await appClient.donate(
            {
                donation: donationTnx,
            },
            {
                sender: donorAccount,
                boxes: boxRef,
            },
        )

        const { td: totalDonations } = await appClient.getGlobalState()

        expect(totalDonations?.asNumber()).toEqual(amountToDonate)
        const donationsMapValue = await appClient.appClient.getBoxValue(
            decodeAddress(donorAccount.addr).publicKey,
        )

        // convert uint8Array back to uint64
        const donation = decodeUint64(donationsMapValue, 'bigint')

        expect(donation).toEqual(BigInt(amountToDonate))
    })

    test('dispense fails if not called by action creator', async () => {
        const currentUnixTimestamp = Math.floor(new Date().getTime() / 1000)
        const encodedTimestamp = algosdk.encodeUint64(currentUnixTimestamp)

        const prefix = Buffer.from('dr') // Prefix for the box
        const name = new Uint8Array(
            Buffer.concat([prefix, Buffer.from(encodedTimestamp)]),
        )

        const boxRef: algosdk.BoxReference[] = [
            {
                appIndex: Number(appRef.appId),
                name: name,
            },
        ]

        await expect(
            appClient.dispense(
                {
                    amount: 1 * USDCBaseUnitMultiplier,
                    description: 'test dispense',
                    id: currentUnixTimestamp,
                    transferToken: fakeUSDCToken,
                },
                {
                    sender: donorAccount,
                    sendParams: {
                        fee: microAlgos(2_000),
                    },
                    boxes: boxRef,
                },
            ),
        ).rejects.toThrow()
    })

    test('dispense fails if amount is greater than available balance', async () => {
        const currentUnixTimestamp = Math.floor(new Date().getTime() / 1000)
        const encodedTimestamp = algosdk.encodeUint64(currentUnixTimestamp)

        const prefix = Buffer.from('dr') // Prefix for the box
        const name = new Uint8Array(
            Buffer.concat([prefix, Buffer.from(encodedTimestamp)]),
        )

        const boxRef: algosdk.BoxReference[] = [
            {
                appIndex: Number(appRef.appId),
                name: name,
            },
        ]

        await expect(
            appClient.dispense(
                {
                    amount: 10000 * USDCBaseUnitMultiplier,
                    description: 'test dispense',
                    id: currentUnixTimestamp,
                    transferToken: fakeUSDCToken,
                },
                {
                    sender: actionCreatorAccount,
                    sendParams: {
                        fee: microAlgos(2_000),
                    },
                    boxes: boxRef,
                },
            ),
        ).rejects.toThrow()
    })

    test('dispense works correctly', async () => {
        const currentUnixTimestamp = Math.floor(new Date().getTime() / 1000)
        const encodedTimestamp = algosdk.encodeUint64(currentUnixTimestamp)
        const withdrawAmount = 10 * USDCBaseUnitMultiplier

        const prefix = Buffer.from('dr') // Prefix for the box
        const name = new Uint8Array(
            Buffer.concat([prefix, Buffer.from(encodedTimestamp)]),
        )

        const boxRef: algosdk.BoxReference[] = [
            {
                appIndex: Number(appRef.appId),
                name: name,
            },
        ]

        await appClient.dispense(
            {
                amount: withdrawAmount,
                description: 'test dispense',
                id: currentUnixTimestamp,
                transferToken: fakeUSDCToken,
            },
            {
                sender: actionCreatorAccount,
                sendParams: {
                    fee: microAlgos(2_000),
                },
                boxes: boxRef,
            },
        )

        const { ab } = await appClient.getGlobalState()

        /** available balance is set correctly. */
        expect(ab?.asBigInt()).toEqual(BigInt(40 * USDCBaseUnitMultiplier))

        // action creator balance is set correctly
        const actionCreatorBalance = await algod
            .accountAssetInformation(actionCreatorAccount.addr, fakeUSDCToken)
            .do()
        expect(actionCreatorBalance['asset-holding'].amount).toBe(
            withdrawAmount,
        )
    })

    test('recollect fails if it not called 2 weeks after end date', async () => {
        await expect(
            appClient.recollect(
                {
                    receiver: deployerAccount.addr,
                    transferToken: fakeUSDCToken,
                },
                {
                    sender: deployerAccount,
                    sendParams: {
                        fee: microAlgos(2_000),
                    },
                },
            ),
        ).rejects.toThrow()
    })
})
