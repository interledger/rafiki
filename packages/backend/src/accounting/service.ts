import { TransactionOrKnex } from 'objection'
import { TransferError } from './errors'

export enum LiquidityAccountType {
  ASSET = 'ASSET',
  PEER = 'PEER',
  INCOMING = 'INCOMING',
  OUTGOING = 'OUTGOING',
  WEB_MONETIZATION = 'WEB_MONETIZATION'
}

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
    accountType: LiquidityAccountType,
    trx?: TransactionOrKnex
  ): Promise<LiquidityAccount>
  createSettlementAccount(
    ledger: number,
    trx?: TransactionOrKnex
  ): Promise<void>
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
