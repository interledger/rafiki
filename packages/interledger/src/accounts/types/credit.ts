export interface CreditOptions {
  accountId: string
  subAccountId: string
  amount: bigint
}

export interface ExtendCreditOptions extends CreditOptions {
  autoApply?: boolean
}

export interface SettleDebtOptions extends CreditOptions {
  revolve?: boolean
}

export enum CreditError {
  SameAccounts = 'SameAccounts',
  UnknownAccount = 'UnknownAccount',
  UnrelatedSubAccount = 'UnrelatedSubAccount',
  UnknownSubAccount = 'UnknownSubAccount',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientCredit = 'InsufficientCredit',
  InsufficientDebt = 'InsufficientDebt'
}
