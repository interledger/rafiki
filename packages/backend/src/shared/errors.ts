import { AssetOptions } from '../asset/service'
import { TransferError } from '../transfer/errors'

export class BalanceTransferError extends Error {
  constructor(public error: TransferError) {
    super()
    this.name = 'TransferError'
  }
}

export class UnknownBalanceError extends Error {
  constructor(balanceId: string) {
    super('Balance not found. balanceId=' + balanceId)
    this.name = 'UnknownBalanceError'
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
