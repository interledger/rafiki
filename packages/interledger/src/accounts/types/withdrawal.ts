interface Withdrawal {
  withdrawalId?: bigint
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
  UnknownAccount = 'UnknownAccount',
  UnknownLiquidityAccount = 'UnknownLiquidityAccount',
  UnknownSettlementAccount = 'UnknownSettlementAccount',
  WithdrawalExists = 'WithdrawalExists'
}
