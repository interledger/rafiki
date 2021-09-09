import { Asset } from './types'

export class UnknownLiquidityAccountError extends Error {
  constructor(asset: Asset) {
    super(
      'Unknown liquidity account. code=' + asset.code + ' scale=' + asset.scale
    )
    this.name = 'UnknownLiquidityAccountError'
  }
}

export class UnknownSettlementAccountError extends Error {
  constructor(asset: Asset) {
    super(
      'Unknown settlement account. code=' + asset.code + ' scale=' + asset.scale
    )
    this.name = 'UnknownSettlementAccountError'
  }
}
