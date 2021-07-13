export interface TrustlineOptions {
  accountId: string
  amount: bigint
}

export enum TrustlineError {
  UnknownAccount = 'UnknownAccount',
  UnknownSuperAccount = 'UnknownSuperAccount'
}
