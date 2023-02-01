import { TransferError } from './errors'

export enum AccountTypeCode {
  Liquidity = 1,
  LiquidityAsset = 2,
  LiquidityPeer = 3,
  LiquidityIncoming = 4,
  LiquidityOutgoing = 5,
  Settlement = 101
}

// Model classes that have a corresponding Tigerbeetle liquidity
// account SHOULD implement this LiquidityAccount interface and call
// createLiquidityAccount for each model instance.
// The Tigerbeetle account id will be the model id.
// Such models include:
//   ../asset/model
//   ../open_payments/payment_pointer/model
//   ../open_payments/payment/incoming/model
//   ../open_payments/payment/outgoing/model
//   ../peer/model
// Asset settlement Tigerbeetle accounts are the only exception.
// Their account id is the corresponding asset's ledger value.
export interface LiquidityAccount {
  id: string
  asset: {
    id: string
    ledger: number
  }
  onCredit?: (options: OnCreditOptions) => Promise<LiquidityAccount>
}

export interface OnCreditOptions {
  totalReceived: bigint
  withdrawalThrottleDelay?: number
}

export interface Deposit {
  id: string
  account: LiquidityAccount
  amount: bigint
}

export interface Withdrawal extends Deposit {
  timeout?: bigint
}

export interface TransferOptions {
  sourceAccount: LiquidityAccount
  destinationAccount: LiquidityAccount
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: bigint
}

export interface Transaction {
  post: () => Promise<void | TransferError>
  void: () => Promise<void | TransferError>
}

export interface AccountingService {
  createLiquidityAccount(
    account: LiquidityAccount,
    accTypeCode?: AccountTypeCode
  ): Promise<LiquidityAccount>
  createSettlementAccount(ledger: number): Promise<void>
  getBalance(id: string): Promise<bigint | undefined>
  getTotalSent(id: string): Promise<bigint | undefined>
  getAccountsTotalSent(ids: string[]): Promise<(bigint | undefined)[]>
  getTotalReceived(id: string): Promise<bigint | undefined>
  getAccountsTotalReceived(ids: string[]): Promise<(bigint | undefined)[]>
  getSettlementBalance(ledger: number): Promise<bigint | undefined>
  createTransfer(options: TransferOptions): Promise<Transaction | TransferError>
  createDeposit(deposit: Deposit): Promise<void | TransferError>
  createWithdrawal(withdrawal: Withdrawal): Promise<void | TransferError>
  postWithdrawal(id: string): Promise<void | TransferError>
  voidWithdrawal(id: string): Promise<void | TransferError>
}
