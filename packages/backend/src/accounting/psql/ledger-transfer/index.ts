import { Transaction, TransactionOrKnex, UniqueViolationError } from 'objection'
import { LedgerTransfer, LedgerTransferState } from './model'
import { ServiceDependencies } from '../service'
import { LedgerAccount } from '../ledger-account/model'
import { TransferError } from '../../errors'
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
export interface CreateTransfersResult {
  errors: CreateTransferError[]
  results: LedgerTransfer[]
}

interface BalanceCheckArgs {
  account: LedgerAccount
  balances: AccountBalance
  transferAmount: bigint
}

export type CreateLedgerTransferArgs = Pick<
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

export async function voidTransfers(
  deps: ServiceDependencies,
  transferRefs: string[]
): Promise<void | TransferError> {
  return updateTransferState(deps, transferRefs, LedgerTransferState.VOIDED)
}

export async function postTransfers(
  deps: ServiceDependencies,
  transferRefs: string[]
): Promise<void | TransferError> {
  return updateTransferState(deps, transferRefs, LedgerTransferState.POSTED)
}

async function updateTransferState(
  deps: ServiceDependencies,
  transferRefs: string[],
  state: LedgerTransferState.POSTED | LedgerTransferState.VOIDED
): Promise<void | TransferError> {
  const trx = await deps.knex.transaction()

  const updateTransfers = async () => {
    for (const transferRef of transferRefs) {
      if (!isValidUuid(transferRef)) {
        return TransferError.InvalidId
      }

      const transfer = await LedgerTransfer.query(trx)
        .findOne({ transferRef })
        .forUpdate()

      if (!transfer) {
        return TransferError.UnknownTransfer
      }

      const error = validateTransferStateUpdate(transfer)

      if (error) {
        return error
      }

      await transfer.$query(trx).patch({ state })
    }
  }

  const error = await updateTransfers()

  if (error) {
    await trx.rollback()
    return error
  }

  try {
    await trx.commit()
  } catch (error) {
    await trx.rollback()

    const errorMessage = 'Could not void transfer(s)'
    deps.logger.error({ errorMessage: error && error['message'] }, errorMessage)
    return TransferError.UnknownError
  }
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

  if (transfer.isExpired) {
    return TransferError.TransferExpired
  }
}

export async function createTransfers(
  deps: ServiceDependencies,
  transfers: CreateLedgerTransferArgs[]
): Promise<CreateTransfersResult> {
  const trx = await deps.knex.transaction()

  const errors: CreateTransferError[] = []
  const results: LedgerTransfer[] = []

  for (const [index, transfer] of transfers.entries()) {
    const error = await validateTransfer(deps, transfer, trx)

    if (error) {
      errors.push({ index, error })
      break
    }

    try {
      const createdTransfer = await LedgerTransfer.query(trx).insertAndFetch(
        prepareTransfer(transfer)
      )

      results.push(createdTransfer)
    } catch (error) {
      const errorMessage = 'Could not create transfer(s)'
      deps.logger.error(
        { errorMessage: error && error['message'] },
        errorMessage
      )
      errors.push({ index, error: TransferError.UnknownError })
    }
  }

  if (errors.length > 0) {
    await trx.rollback()
    return { results: [], errors }
  }

  try {
    await trx.commit()

    return { results, errors: [] }
  } catch (error) {
    await trx.rollback()

    const errorMessage = 'Could not create transfer(s)'
    deps.logger.error({ errorMessage: error && error['message'] }, errorMessage)
    return {
      results: [],
      errors: [{ index: -1, error: TransferError.UnknownError }]
    }
  }
}

async function validateTransfer(
  deps: ServiceDependencies,
  args: CreateLedgerTransferArgs,
  trx: Transaction
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

  if (await LedgerTransfer.query(trx).findOne({ transferRef })) {
    return TransferError.TransferExists
  }

  return validateBalances(deps, args, trx)
}

async function validateBalances(
  deps: ServiceDependencies,
  args: CreateLedgerTransferArgs,
  trx: Transaction
): Promise<TransferError | undefined> {
  const { amount, creditAccount, debitAccount } = args

  const [creditAccountBalances, debitAccountBalance] = await Promise.all([
    getAccountBalances(deps, creditAccount, trx),
    getAccountBalances(deps, debitAccount, trx)
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
    !hasEnoughCreditBalance({
      account: debitAccount,
      balances: debitAccountBalance,
      transferAmount: amount
    })
  ) {
    return TransferError.InsufficientBalance
  }
}

export function hasEnoughCreditBalance(args: BalanceCheckArgs): boolean {
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
  transfer: CreateLedgerTransferArgs
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
