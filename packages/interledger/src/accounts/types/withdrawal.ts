interface Withdrawal {
  id?: string
  amount: bigint
}

export interface AccountWithdrawal extends Withdrawal {
  accountId: string
}

export interface LiquidityWithdrawal extends Withdrawal {
  assetCode: string
  assetScale: number
}

export enum WithdrawError {
  InsufficientBalance = 'InsufficientBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InsufficientSettlementBalance = 'InsufficientSettlementBalance',
  InvalidId = 'InvalidId',
  UnknownAccount = 'UnknownAccount',
  UnknownLiquidityAccount = 'UnknownLiquidityAccount',
  UnknownSettlementAccount = 'UnknownSettlementAccount',
  WithdrawalExists = 'WithdrawalExists'
}
