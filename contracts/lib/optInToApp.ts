import * as algokit from '@algorandfoundation/algokit-utils';
import algosdk, { Algodv2 } from 'algosdk';

type OptInToAppProps = {
    account: algosdk.Account;
    appId: number;
    algod: Algodv2;
};

const optInToApp = async ({ account, algod, appId }: OptInToAppProps) => {
    const params = await algod.getTransactionParams().do();

    const txn = algosdk.makeApplicationOptInTxn(account.addr, params, appId);

    const signedTxn = txn.signTxn(account.sk);
    const txId = txn.txID().toString();
    console.log('signedTxn', signedTxn);
    console.log('Signed transaction with txID: %s', txId);

    const rawTx = await algod.sendRawTransaction(signedTxn).do();
    console.log('rawTx', rawTx);

    // Wait for confirmation
    await algokit.waitForConfirmation(rawTx.txId, 3, algod);
};

export default optInToApp;
