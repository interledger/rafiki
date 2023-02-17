import { TransactionOrKnex, UniqueViolationError } from 'objection'
import { LedgerTransfer, LedgerTransferState } from './model'
import { ServiceDependencies } from '../service'
import { LedgerAccount } from '../ledger-account/model'
import { isTransferError, TransferError } from '../../errors'
import { AccountBalance, getAccountBalances } from '../balance'
import { validateId as isValidUuid } from '../../../shared/utils'

interface GetTransfersResult {
  credits: LedgerTransfer[]
  debits: LedgerTransfer[]
}

interface CreateTransferError {
  index: number
  error: TransferError
}
interface CreateTransfersResult {
  errors: CreateTransferError[]
  results: LedgerTransfer[]
}

interface BalanceCheckArgs {
  account: LedgerAccount
  balances: AccountBalance
  transferAmount: bigint
}

export type CreateTransferArgs = Pick<
  LedgerTransfer,
  'amount' | 'transferRef' | 'type'
> & {
  creditAccount: LedgerAccount
  debitAccount: LedgerAccount
  timeoutMs?: bigint
}

export async function getAccountTransfers(
  deps: ServiceDependencies,
  accountId: string,
  trx?: TransactionOrKnex
): Promise<GetTransfersResult> {
  const transfers = await LedgerTransfer.query(trx || deps.knex)
    .where((query) =>
      query.where({ debitAccountId: accountId }).orWhere({
        creditAccountId: accountId
      })
    )
    .where((query) =>
      query.where({ expiresAt: null }).orWhere('expiresAt', '>', new Date())
    )
    .andWhereNot({
      state: LedgerTransferState.VOIDED
    })

  return transfers.reduce(
    (results, transfer) => {
      if (transfer.debitAccountId === accountId) {
        results.debits.push(transfer)
      } else {
        results.credits.push(transfer)
      }

      return results
    },
    { credits: [], debits: [] } as GetTransfersResult
  )
}

export async function voidTransfer(
  deps: ServiceDependencies,
  transferRef: string
): Promise<void | TransferError> {
  return updateTransferState(deps, transferRef, LedgerTransferState.VOIDED)
}

export async function postTransfer(
  deps: ServiceDependencies,
  transferRef: string
): Promise<void | TransferError> {
  return updateTransferState(deps, transferRef, LedgerTransferState.POSTED)
}

async function updateTransferState(
  deps: ServiceDependencies,
  transferRef: string,
  state: LedgerTransferState.POSTED | LedgerTransferState.VOIDED
): Promise<void | TransferError> {
  return await deps.knex.transaction(async (trx) => {
    const transfer = await LedgerTransfer.query(trx)
      .findOne({ transferRef })
      .forUpdate()

    if (!transfer) {
      return TransferError.UnknownTransfer
    }

    const transferError = validateTransferStateUpdate(transfer)

    if (transferError) {
      return transferError
    }

    await transfer.$query(trx).patch({ state })
  })
}

function validateTransferStateUpdate(
  transfer: LedgerTransfer
): TransferError | void {
  if (transfer.isVoided) {
    return TransferError.AlreadyVoided
  }

  if (transfer.isPosted) {
    return TransferError.AlreadyPosted
  }

  if (transfer.expired) {
    return TransferError.TransferExpired
  }
}

export async function createTransfers(
  deps: ServiceDependencies,
  transfers: CreateTransferArgs[],
  trx?: TransactionOrKnex
): Promise<CreateTransfersResult> {
  try {
    const validationResults = await Promise.all(
      transfers.map((transfer) =>
        validateTransfer(deps, {
          creditAccount: transfer.creditAccount,
          debitAccount: transfer.debitAccount,
          amount: transfer.amount,
          transferRef: transfer.transferRef,
          timeoutMs: transfer.timeoutMs
        })
      )
    )

    const errors: CreateTransferError[] = []

    for (const [i, maybeError] of validationResults.entries()) {
      if (isTransferError(maybeError)) {
        errors.push({
          index: i,
          error: maybeError
        })
      }
    }

    if (errors.length > 0) {
      return {
        results: [],
        errors
      }
    }

    const createdTransfers = await LedgerTransfer.query(
      trx || deps.knex
    ).insertAndFetch(transfers.map(prepareTransfer))

    return {
      results: createdTransfers,
      errors: []
    }
  } catch (error) {
    if (error instanceof UniqueViolationError) {
      return {
        results: [],
        errors: [{ index: -1, error: TransferError.TransferExists }]
      }
    }

    const errorMessage = 'Could not create transfer(s)'
    deps.logger.error({ errorMessage: error && error['message'] }, errorMessage)
    throw new Error(errorMessage)
  }
}

async function validateTransfer(
  deps: ServiceDependencies,
  args: CreateTransferArgs
): Promise<TransferError | undefined> {
  const { amount, timeoutMs, creditAccount, debitAccount, transferRef } = args

  if (!isValidUuid(transferRef)) {
    return TransferError.InvalidId
  }

  if (amount <= 0n) {
    return TransferError.InvalidAmount
  }

  if (timeoutMs && timeoutMs <= 0n) {
    return TransferError.InvalidTimeout
  }

  if (creditAccount.id === debitAccount.id) {
    return TransferError.SameAccounts
  }

  if (creditAccount.ledger !== debitAccount.ledger) {
    return TransferError.DifferentAssets
  }

  return validateBalances(deps, args)
}

async function validateBalances(
  deps: ServiceDependencies,
  args: CreateTransferArgs
): Promise<TransferError | undefined> {
  const { amount, creditAccount, debitAccount } = args

  const [creditAccountBalances, debitAccountBalance] = await Promise.all([
    getAccountBalances(deps, creditAccount),
    getAccountBalances(deps, debitAccount)
  ])

  if (
    !hasEnoughDebitBalance({
      account: creditAccount,
      balances: creditAccountBalances,
      transferAmount: amount
    })
  ) {
    return TransferError.InsufficientDebitBalance
  }

  if (
    !hasEnoughLiquidity({
      account: debitAccount,
      balances: debitAccountBalance,
      transferAmount: amount
    })
  ) {
    return TransferError.InsufficientLiquidity
  }
}

export function hasEnoughLiquidity(args: BalanceCheckArgs): boolean {
  const { account, balances, transferAmount } = args
  const { creditsPosted, debitsPosted, debitsPending } = balances

  return (
    account.isSettlementAccount ||
    creditsPosted >= debitsPosted + debitsPending + transferAmount
  )
}

export function hasEnoughDebitBalance(args: BalanceCheckArgs): boolean {
  const { account, balances, transferAmount } = args
  const { creditsPosted, creditsPending, debitsPosted } = balances

  return (
    !account.isSettlementAccount ||
    debitsPosted >= creditsPosted + creditsPending + transferAmount
  )
}

function prepareTransfer(
  transfer: CreateTransferArgs
): Partial<LedgerTransfer> {
  return {
    amount: transfer.amount,
    transferRef: transfer.transferRef,
    creditAccountId: transfer.creditAccount.id,
    debitAccountId: transfer.debitAccount.id,
    ledger: transfer.creditAccount.ledger,
    state: transfer.timeoutMs
      ? LedgerTransferState.PENDING
      : LedgerTransferState.POSTED,
    expiresAt: transfer.timeoutMs
      ? new Date(Date.now() + Number(transfer.timeoutMs))
      : undefined,
    type: transfer.type
  }
}
