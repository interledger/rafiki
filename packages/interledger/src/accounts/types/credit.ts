export interface CreditOptions {
  accountId: string
  amount: bigint
}

export interface ExtendCreditOptions extends CreditOptions {
  autoApply?: boolean
}

export interface SettleDebtOptions extends CreditOptions {
  revolve?: boolean
}

export enum CreditError {
  InsufficientBalance = 'InsufficientBalance',
  InsufficientCredit = 'InsufficientCredit',
  InsufficientDebt = 'InsufficientDebt',
  UnknownAccount = 'UnknownAccount',
  UnknownSuperAccount = 'UnknownSuperAccount'
}
