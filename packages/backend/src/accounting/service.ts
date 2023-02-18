import { TransactionOrKnex } from 'objection'
import { isTransferError, TransferError } from './errors'

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

export interface TransferToCreate {
  sourceAccountId: string
  destinationAccountId: string
  amount: bigint
}

interface CreateAccountToAccountTransferArgs {
  transferArgs: TransferOptions
  voidTransfers(transferIds: string[]): Promise<void | TransferError>
  postTransfers(transferIds: string[]): Promise<void | TransferError>
  getAccountReceived(accountRef: string): Promise<bigint | undefined>
  createPendingTransfers(
    transfers: TransferToCreate[]
  ): Promise<string[] | TransferError>
  withdrawalThrottleDelay?: number
}

export async function createAccountToAccountTransfer(
  args: CreateAccountToAccountTransferArgs
): Promise<Transaction | TransferError> {
  const {
    voidTransfers,
    postTransfers,
    createPendingTransfers,
    getAccountReceived,
    withdrawalThrottleDelay,
    transferArgs
  } = args

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

  return {
    post: async (): Promise<void | TransferError> => {
      const error = await postTransfers(pendingTransferIdsOrError)

      if (error) {
        return error
      }

      if (destinationAccount.onCredit) {
        const totalReceived = await getAccountReceived(destinationAccount.id)

        if (totalReceived === undefined) {
          throw new Error()
        }

        await destinationAccount.onCredit({
          totalReceived,
          withdrawalThrottleDelay
        })
      }
    },
    void: async (): Promise<void | TransferError> => {
      const error = await voidTransfers(pendingTransferIdsOrError)

      if (error) {
        return error
      }
    }
  }
}

export function buildCrossAssetTransfers(
  args: TransferOptions
): TransferToCreate[] | TransferError {
  const { sourceAccount, destinationAccount, sourceAmount, destinationAmount } =
    args

  if (!destinationAmount) {
    return TransferError.InvalidDestinationAmount
  }

  const transfers: TransferToCreate[] = []
  // Send to source liquidity account
  transfers.push({
    sourceAccountId: sourceAccount.id,
    destinationAccountId: sourceAccount.asset.id,
    amount: sourceAmount
  })

  // Deliver from destination liquidity account
  transfers.push({
    sourceAccountId: destinationAccount.asset.id,
    destinationAccountId: destinationAccount.id,
    amount: destinationAmount
  })

  return transfers
}

export function buildSameAssetTransfers(
  args: TransferOptions
): TransferToCreate[] {
  const { sourceAccount, destinationAccount, sourceAmount, destinationAmount } =
    args
  const transfers: TransferToCreate[] = []

  transfers.push({
    sourceAccountId: sourceAccount.id,
    destinationAccountId: destinationAccount.id,
    amount:
      destinationAmount && destinationAmount < sourceAmount
        ? destinationAmount
        : sourceAmount
  })

  if (destinationAmount && sourceAmount !== destinationAmount) {
    // Send excess source amount to liquidity account
    if (destinationAmount < sourceAmount) {
      transfers.push({
        sourceAccountId: sourceAccount.id,
        destinationAccountId: sourceAccount.asset.id,
        amount: sourceAmount - destinationAmount
      })
    } else {
      // Deliver excess destination amount from liquidity account
      transfers.push({
        sourceAccountId: destinationAccount.asset.id,
        destinationAccountId: destinationAccount.id,
        amount: destinationAmount - sourceAmount
      })
    }
  }

  return transfers
}
