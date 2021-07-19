export interface TrustlineOptions {
  accountId: string
  amount: bigint
}

export interface ExtendTrustlineOptions extends TrustlineOptions {
  autoApply?: boolean
}

export interface SettleTrustlineOptions extends TrustlineOptions {
  revolve?: boolean
}

export enum TrustlineError {
  InsufficientBalance = 'InsufficientBalance',
  UnknownAccount = 'UnknownAccount',
  UnknownSuperAccount = 'UnknownSuperAccount',
  UnknownTrustline = 'UnknownTrustline'
}
