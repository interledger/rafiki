import { AccountError } from '../../core/services/accounts'

export class InsufficientBalanceError extends Error {
  constructor(accountId: string) {
    super('Insufficient balance. accountId=' + accountId)
    this.name = 'InsufficientBalanceError'
  }
}

export class InsufficientLiquidityError extends Error {
  constructor(assetCode: string, assetScale: number) {
    super(
      'Insufficient liquidity account balance. asset code=' +
        assetCode +
        ' asset scale=' +
        assetScale
    )
    this.name = 'InsufficientLiquidityError'
  }
}

export class InvalidAssetError extends Error {
  constructor(code: string, scale: number) {
    super('Invalid asset. code=' + code + ' scale=' + scale)
    this.name = 'InvalidAssetError'
  }
}

export class InvalidTransferError extends Error {
  constructor(message = '') {
    super(message)
    this.name = 'InvalidAmountError'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAccountError = (o: any): o is AccountError =>
  Object.values(AccountError).includes(o)
