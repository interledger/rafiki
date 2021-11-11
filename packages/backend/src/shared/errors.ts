import { AssetOptions } from '../asset/service'
import { TransferError } from '../tigerbeetle/transfer/errors'

export class BalanceTransferError extends Error {
  constructor(public error: TransferError) {
    super()
    this.name = 'TransferError'
  }
}

export class UnknownAccountError extends Error {
  constructor(accountId: string) {
    super('Account not found. accountId=' + accountId)
    this.name = 'UnknownAccountError'
  }
}

export class UnknownLiquidityAccountError extends Error {
  constructor(asset: AssetOptions) {
    super(
      'Unknown liquidity account. code=' + asset.code + ' scale=' + asset.scale
    )
    this.name = 'UnknownLiquidityAccountError'
  }
}

export class UnknownSettlementAccountError extends Error {
  constructor(asset: AssetOptions) {
    super(
      'Unknown settlement account. code=' + asset.code + ' scale=' + asset.scale
    )
    this.name = 'UnknownSettlementAccountError'
  }
}
