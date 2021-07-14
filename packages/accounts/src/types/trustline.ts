export interface TrustlineOptions {
  accountId: string
  amount: bigint
}

export interface ExtendTrustlineOptions extends TrustlineOptions {
  autoApply?: boolean
}

export enum TrustlineError {
  InsufficientBalance = 'InsufficientBalance',
  UnknownAccount = 'UnknownAccount',
  UnknownSuperAccount = 'UnknownSuperAccount',
  UnknownTrustline = 'UnknownTrustline'
}
