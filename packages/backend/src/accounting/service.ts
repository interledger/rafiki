import { TransactionOrKnex } from 'objection'
import { BaseService } from '../shared/baseService'
import { TransferError, isTransferError } from './errors'
import { IAppConfig } from '../config/app'

export enum LiquidityAccountType {
  ASSET = 'ASSET',
  PEER = 'PEER',
  INCOMING = 'INCOMING',
  OUTGOING = 'OUTGOING',
  WEB_MONETIZATION = 'WEB_MONETIZATION'
}

export enum TransferType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER'
}

export enum LedgerTransferState {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  VOIDED = 'VOIDED'
}

export interface LiquidityAccountAsset {
  id: string
  code?: string
  scale?: number
  ledger: number
  onDebit?: (
    options: OnDebitOptions,
    config: IAppConfig
  ) => Promise<LiquidityAccount>
}

export interface LiquidityAccount {
  id: string
  asset: LiquidityAccountAsset
  onCredit?: (options: OnCreditOptions) => Promise<LiquidityAccount>
  onDebit?: (
    options: OnDebitOptions,
    config: IAppConfig
  ) => Promise<LiquidityAccount>
}

export interface OnCreditOptions {
  totalReceived: bigint
  withdrawalThrottleDelay?: number
}

export interface OnDebitOptions {
  balance: bigint
}

export interface BaseTransfer {
  transferType?: TransferType
}

export interface Deposit extends BaseTransfer {
  id: string
  account: LiquidityAccount
  amount: bigint
}

export interface Withdrawal extends Deposit {
  timeout?: number
}

export interface TransferOptions extends BaseTransfer {
  sourceAccount: LiquidityAccount
  destinationAccount: LiquidityAccount
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: number
}

export interface Transaction {
  post: () => Promise<void | TransferError>
  void: () => Promise<void | TransferError>
}

export interface GetLedgerTransfersResult {
  debits: LedgerTransfer[]
  credits: LedgerTransfer[]
}

export interface LedgerTransfer extends BaseTransfer {
  id: string
  debitAccountId: string
  creditAccountId: string
  amount: bigint
  timeout: number
  timestamp: bigint
  type: TransferType
  state: LedgerTransferState
  ledger: number
  transferRef?: string
  expiresAt?: Date
}

export interface AccountingService {
  createLiquidityAccount(
    account: LiquidityAccount,
    accountType: LiquidityAccountType,
    trx?: TransactionOrKnex
  ): Promise<LiquidityAccount>
  createLiquidityAndLinkedSettlementAccount(
    account: LiquidityAccount,
    accountType: LiquidityAccountType,
    trx?: TransactionOrKnex
  ): Promise<LiquidityAccount>
  getBalance(id: string): Promise<bigint | undefined>
  getTotalSent(id: string): Promise<bigint | undefined>
  getAccountsTotalSent(ids: string[]): Promise<(bigint | undefined)[]>
  getTotalReceived(id: string): Promise<bigint | undefined>
  getAccountsTotalReceived(ids: string[]): Promise<(bigint | undefined)[]>
  getSettlementBalance(ledger: number): Promise<bigint | undefined>
  createTransfer(options: TransferOptions): Promise<Transaction | TransferError>
  createDeposit(
    deposit: Deposit,
    trx?: TransactionOrKnex
  ): Promise<void | TransferError>
  createWithdrawal(withdrawal: Withdrawal): Promise<void | TransferError>
  postWithdrawal(id: string): Promise<void | TransferError>
  voidWithdrawal(id: string): Promise<void | TransferError>
  getAccountTransfers(
    id: string | number,
    limit?: number,
    trx?: TransactionOrKnex
  ): Promise<GetLedgerTransfersResult>
}

export interface TransferToCreate {
  sourceAccountId: string
  destinationAccountId: string
  amount: bigint
  ledger: number
  transferType?: TransferType
}

export interface BaseAccountingServiceDependencies extends BaseService {
  config: IAppConfig
  withdrawalThrottleDelay?: number
}

interface CreateAccountToAccountTransferArgs {
  transferArgs: TransferOptions
  voidTransfers(transferIds: string[]): Promise<void | TransferError>
  postTransfers(transferIds: string[]): Promise<void | TransferError>
  getAccountReceived(accountRef: string): Promise<bigint | undefined>
  getAccountBalance(accountRef: string): Promise<bigint | undefined>
  createPendingTransfers(
    transfers: TransferToCreate[]
  ): Promise<string[] | TransferError>
}

export async function createAccountToAccountTransfer(
  deps: BaseAccountingServiceDependencies,
  args: CreateAccountToAccountTransferArgs
): Promise<Transaction | TransferError> {
  const {
    transferArgs,
    voidTransfers,
    postTransfers,
    createPendingTransfers,
    getAccountReceived,
    getAccountBalance
  } = args

  const { withdrawalThrottleDelay } = deps

  const { sourceAccount, destinationAccount, sourceAmount, destinationAmount } =
    transferArgs

  if (sourceAccount.id === destinationAccount.id) {
    return TransferError.SameAccounts
  }

  if (sourceAmount <= 0n) {
    return TransferError.InvalidSourceAmount
  }

  if (destinationAmount !== undefined && destinationAmount <= 0n) {
    return TransferError.InvalidDestinationAmount
  }

  const transfersToCreateOrError =
    sourceAccount.asset.ledger === destinationAccount.asset.ledger
      ? buildSameAssetTransfers(transferArgs)
      : buildCrossAssetTransfers(transferArgs)

  if (isTransferError(transfersToCreateOrError)) {
    return transfersToCreateOrError
  }

  const pendingTransferIdsOrError = await createPendingTransfers(
    transfersToCreateOrError
  )

  if (isTransferError(pendingTransferIdsOrError)) {
    return pendingTransferIdsOrError
  }

  const onDebit = async (
    account: LiquidityAccount | LiquidityAccount['asset'],
    config: IAppConfig
  ) => {
    if (account.onDebit) {
      const balance = await getAccountBalance(account.id)
      if (balance === undefined) throw new Error('undefined account balance')

      await account.onDebit(
        {
          balance
        },
        config
      )
    }
  }

  return {
    post: async (): Promise<void | TransferError> => {
      const error = await postTransfers(pendingTransferIdsOrError)
      if (error) return error

      await Promise.all([
        onDebit(sourceAccount, deps.config),
        onDebit(destinationAccount.asset, deps.config)
      ])

      if (destinationAccount.onCredit) {
        const totalReceived = await getAccountReceived(destinationAccount.id)

        if (totalReceived === undefined) {
          throw new Error('total received is undefined')
        }

        await destinationAccount.onCredit({
          totalReceived,
          withdrawalThrottleDelay
        })
      }
    },

    void: async (): Promise<void | TransferError> => {
      const error = await voidTransfers(pendingTransferIdsOrError)
      if (error) return error
    }
  }
}

export function buildCrossAssetTransfers(
  args: TransferOptions
): TransferToCreate[] | TransferError {
  const {
    sourceAccount,
    destinationAccount,
    sourceAmount,
    destinationAmount,
    transferType
  } = args

  if (!destinationAmount) {
    return TransferError.InvalidDestinationAmount
  }

  const transfers: TransferToCreate[] = []
  // Send to source liquidity account
  transfers.push({
    sourceAccountId: sourceAccount.id,
    destinationAccountId: sourceAccount.asset.id,
    amount: sourceAmount,
    ledger: sourceAccount.asset.ledger,
    transferType
  })

  // Deliver from destination liquidity account
  transfers.push({
    sourceAccountId: destinationAccount.asset.id,
    destinationAccountId: destinationAccount.id,
    amount: destinationAmount,
    ledger: destinationAccount.asset.ledger,
    transferType
  })

  return transfers
}

export function buildSameAssetTransfers(
  args: TransferOptions
): TransferToCreate[] {
  const {
    sourceAccount,
    destinationAccount,
    sourceAmount,
    destinationAmount,
    transferType
  } = args
  const transfers: TransferToCreate[] = []

  transfers.push({
    sourceAccountId: sourceAccount.id,
    destinationAccountId: destinationAccount.id,
    amount:
      destinationAmount && destinationAmount < sourceAmount
        ? destinationAmount
        : sourceAmount,
    ledger: sourceAccount.asset.ledger,
    transferType
  })

  if (destinationAmount && sourceAmount !== destinationAmount) {
    // Send excess source amount to liquidity account
    if (destinationAmount < sourceAmount) {
      transfers.push({
        sourceAccountId: sourceAccount.id,
        destinationAccountId: sourceAccount.asset.id,
        amount: sourceAmount - destinationAmount,
        ledger: sourceAccount.asset.ledger,
        transferType
      })
    } else {
      // Deliver excess destination amount from liquidity account
      transfers.push({
        sourceAccountId: destinationAccount.asset.id,
        destinationAccountId: destinationAccount.id,
        amount: destinationAmount - sourceAmount,
        ledger: sourceAccount.asset.ledger,
        transferType
      })
    }
  }

  return transfers
}
