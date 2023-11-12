import algosdk, { Algodv2 } from 'algosdk'

type AssetTransferProps = {
    from: algosdk.Account
    to: string
    assetIndex: number
    amount: number
    algod: Algodv2
}
const assetTransfer = async (props: AssetTransferProps) => {
    const params = await props.algod.getTransactionParams().do()
    const signed = algosdk
        .makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: props.from.addr,
            to: props.to,
            amount: props.amount,
            assetIndex: props.assetIndex,
            suggestedParams: { ...params }
        })
        .signTxn(props.from.sk)
    return await props.algod.sendRawTransaction(signed).do()
}

export default assetTransfer
