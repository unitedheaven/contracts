import algosdk, { Algodv2 } from 'algosdk';
import assetTransfer from './assetTransfer';

type OptInToAssetProps = {
    account: algosdk.Account;
    assetIndex: number;
    algod: Algodv2;
};

const optInToAsset = (props: OptInToAssetProps) => {
    return assetTransfer({
        from: props.account,
        to: props.account.addr,
        assetIndex: props.assetIndex,
        amount: 0,
        algod: props.algod,
    });
};

export default optInToAsset;
