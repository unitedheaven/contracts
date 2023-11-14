import algosdk, { Algodv2 } from 'algosdk'
import * as algokit from '@algorandfoundation/algokit-utils'

type CreateTokenProps = {
    account: algosdk.Account
    name: string
    algod: Algodv2
}

const createToken = async (props: CreateTokenProps) => {
    const params = await props.algod.getTransactionParams().do()
    const tokenTx = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
        from: props.account.addr,
        reserve: props.account.addr,
        decimals: 6,
        defaultFrozen: false,
        total: 1_000_000_000_000,
        assetName: props.name,
        manager: props.account.addr,
        unitName: props.name,
        suggestedParams: params,
    })

    const rawTx = await props.algod
        .sendRawTransaction(tokenTx.signTxn(props.account.sk))
        .do()
    const token = await algokit.waitForConfirmation(rawTx.txId, 3, props.algod)
    const tokenId = Number(token.assetIndex)
    return tokenId
}

export default createToken
