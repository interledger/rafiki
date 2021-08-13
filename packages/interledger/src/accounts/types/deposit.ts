interface Deposit {
  depositId?: bigint
  amount: bigint
}

export interface AccountDeposit extends Deposit {
  accountId: string
}

export interface LiquidityDeposit extends Deposit {
  assetCode: string
  assetScale: number
}

export enum DepositError {
  DepositExists = 'DepositExists',
  UnknownAccount = 'UnknownAccount'
}
