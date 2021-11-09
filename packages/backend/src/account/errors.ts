export class UnknownAssetError extends Error {
  constructor(public assetId: string) {
    super('Asset not found. assetId=' + assetId)
    this.name = 'UnknownAssetError'
  }
}

export enum AccountTransferError {
  AlreadyCommitted = 'AlreadyCommitted',
  AlreadyRolledBack = 'AlreadyRolledBack',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InvalidSourceAmount = 'InvalidSourceAmount',
  InvalidDestinationAmount = 'InvalidDestinationAmount',
  ReceiveLimitExceeded = 'ReceiveLimitExceeded',
  SameAccounts = 'SameAccounts',
  TransferExpired = 'TransferExpired'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAccountTransferError = (o: any): o is AccountTransferError =>
  Object.values(AccountTransferError).includes(o)
