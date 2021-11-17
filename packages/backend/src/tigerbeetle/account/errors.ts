export class CreateAccountError extends Error {
  constructor(public code: number) {
    super()
    this.name = 'CreateAccountError'
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
