export class InvalidAssetError extends Error {
  constructor(code: string, scale: number) {
    super('Invalid asset. code=' + code + ' scale=' + scale)
    this.name = 'InvalidAssetError'
  }
}

export class TransferError extends Error {
  constructor(public code: number) {
    super()
    this.name = 'TransferError'
  }
}

export class UnknownAccountError extends Error {
  constructor(accountId?: string) {
    super('Account not found' + accountId ? '. accountId=' + accountId : '')
    this.name = 'UnknownAccountError'
  }
}

export class UnknownBalanceError extends Error {
  constructor(accountId: string) {
    super('Balance not found. accountId=' + accountId)
    this.name = 'UnknownBalanceError'
  }
}

export class UnknownLiquidityAccountError extends Error {
  constructor(code: string, scale: number) {
    super('Unknown liquidity account. code=' + code + ' scale=' + scale)
    this.name = 'UnknownLiquidityAccountError'
  }
}
