export class BalanceTransferError extends Error {
  constructor(public code: number) {
    super()
    this.name = 'TransferError'
  }
}

export class CreateBalanceError extends Error {
  constructor(public code: number) {
    super()
    this.name = 'CreateBalanceError'
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

export class UnknownSettlementAccountError extends Error {
  constructor(code: string, scale: number) {
    super('Unknown settlement account. code=' + code + ' scale=' + scale)
    this.name = 'UnknownSettlementAccountError'
  }
}
