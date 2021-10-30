export class UnknownAssetError extends Error {
  constructor(public accountId: string) {
    super('Asset not found. accountId=' + accountId)
    this.name = 'UnknownAssetError'
  }
}

export enum AccountError {
  DuplicateAccountId = 'DuplicateAccountId',
  UnknownAccount = 'UnknownAccount',
  UnknownAsset = 'UnknownAsset'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAccountError = (o: any): o is AccountError =>
  Object.values(AccountError).includes(o)

export enum AccountTransferError {
  AlreadyCommitted = 'AlreadyCommitted',
  AlreadyRolledBack = 'AlreadyRolledBack',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InvalidSourceAmount = 'InvalidSourceAmount',
  InvalidDestinationAmount = 'InvalidDestinationAmount',
  SameAccounts = 'SameAccounts',
  TransferExpired = 'TransferExpired'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAccountTransferError = (o: any): o is AccountTransferError =>
  Object.values(AccountTransferError).includes(o)
