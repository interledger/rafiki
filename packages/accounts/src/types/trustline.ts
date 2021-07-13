export interface TrustlineOptions {
  accountId: string
  amount: bigint
}

export enum TrustlineError {
  InsufficientBalance = 'InsufficientBalance',
  UnknownAccount = 'UnknownAccount',
  UnknownSuperAccount = 'UnknownSuperAccount',
  UnknownTrustline = 'UnknownTrustline'
}
