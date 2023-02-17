export class CreateAccountError extends Error {
  constructor(public code: number) {
    super('CreateAccountError code=' + code)
    this.name = 'CreateAccountError'
  }
}

export class AccountAlreadyExistsError extends Error {
  constructor(public message: string) {
    super(`AccountAlreadyExistsError ${message}`)
    this.name = 'AccountAlreadyExistsError'
  }
}

export enum TransferError {
  AlreadyPosted = 'AlreadyPosted',
  AlreadyVoided = 'AlreadyVoided',
  DifferentAssets = 'DifferentAssets',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientDebitBalance = 'InsufficientDebitBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InvalidAmount = 'InvalidAmount',
  InvalidId = 'InvalidId',
  InvalidSourceAmount = 'InvalidSourceAmount',
  InvalidDestinationAmount = 'InvalidDestinationAmount',
  InvalidTimeout = 'InvalidTimeout',
  SameAccounts = 'SameAccounts',
  TransferExists = 'TransferExists',
  TransferExpired = 'TransferExpired',
  UnknownTransfer = 'UnknownTransfer',
  UnknownSourceAccount = 'UnknownSourceAccount',
  UnknownDestinationAccount = 'UnknownDestinationAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isTransferError = (o: any): o is TransferError =>
  Object.values(TransferError).includes(o)

export class BalanceTransferError extends Error {
  constructor(public error: TransferError) {
    super()
    this.name = 'TransferError'
  }
}
