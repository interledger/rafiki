interface DepositOptions {
  id?: string
  amount: bigint
}

export interface AccountDeposit extends DepositOptions {
  accountId: string
}

export interface LiquidityDeposit extends DepositOptions {
  assetCode: string
  assetScale: number
}

export type Deposit = Required<AccountDeposit> & {
  // createdTime: bigint
}

export enum DepositError {
  DepositExists = 'DepositExists',
  InvalidId = 'InvalidId',
  UnknownAccount = 'UnknownAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isDepositError = (o: any): o is DepositError =>
  Object.values(DepositError).includes(o)
