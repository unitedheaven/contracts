import {
    algos,
    getOrCreateKmdWalletAccount,
    microAlgos,
} from '@algorandfoundation/algokit-utils';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import {
    AppMetadata,
    AppReference,
} from '@algorandfoundation/algokit-utils/types/app';
import { beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import algosdk, { encodeAddress } from 'algosdk';
import { GovernanceClient } from '../contracts/clients/governance';
import assetTransfer from '../contracts/lib/assetTransfer';
import createToken from '../contracts/lib/createToken';
import optInToAsset from '../contracts/lib/optInToAsset';

const fixture = algorandFixture();

let appClient: GovernanceClient;
let UNIToken: number;
let appRef: AppMetadata | AppReference;
let governanceAccount: algosdk.Account;
let stakerAccount: algosdk.Account;
let algod: algosdk.Algodv2;
const UNIBaseUnitMultiplier = 10 ** 6;

describe('Governance', () => {
    beforeEach(fixture.beforeEach);

    beforeAll(async () => {
        await fixture.beforeEach();
        const { kmd } = fixture.context;
        algod = fixture.context.algod;

        /** Create Governance account */
        governanceAccount = await getOrCreateKmdWalletAccount(
            {
                name: 'governance-account',
                fundWith: algos(10),
            },
            algod,
            kmd,
        );

        /** Create staker account */
        stakerAccount = await getOrCreateKmdWalletAccount(
            {
                name: 'staker-account',
                fundWith: algos(10),
            },
            algod,
            kmd,
        );

        /** Create action client */
        appClient = new GovernanceClient(
            {
                sender: governanceAccount,
                resolveBy: 'id',
                id: 0,
            },
            algod,
        );

        /** Create UNI token in localnet */
        UNIToken = await createToken({
            account: governanceAccount,
            name: 'UNI',
            algod,
        });

        /** Opt In creator to USDC token */
        await optInToAsset({
            account: stakerAccount,
            assetIndex: UNIToken,
            algod,
        });

        /** Transfer UNI tokens to staker */
        await assetTransfer({
            algod,
            amount: 10_000 * UNIBaseUnitMultiplier,
            assetIndex: UNIToken,
            from: governanceAccount,
            to: stakerAccount.addr,
        });

        await appClient.create.createApplication(
            {},
            {
                sender: governanceAccount,
            },
        );

        /** fund app with algos */
        await appClient.appClient.fundAppAccount(microAlgos(400_000));

        appRef = await appClient.appClient.getAppReference();

        console.table([
            ['tokenAsset', UNIToken],
            ['app address', appRef.appAddress],
            ['governance address', governanceAccount.addr],
            ['staker address', stakerAccount.addr],
        ]);
    }, 15_000);

    test('createApplication sets initial global value correctly', async () => {
        const { uni, g, vtr, div } = await appClient.getGlobalState();
        const address = encodeAddress(g!.asByteArray());
        expect(uni?.asNumber()).toBe(0);
        expect(address).toBe(governanceAccount.addr);
        expect(vtr?.asNumber()).toBe(1);
        expect(div?.asNumber()).toBe(1);
    });

    test('staker account has 10_000 UNI tokens', async () => {
        const accountInfo = await algod
            .accountAssetInformation(stakerAccount.addr, UNIToken)
            .do();
        expect(accountInfo['asset-holding'].amount).toBe(
            10_000 * UNIBaseUnitMultiplier,
        );
    });
});
