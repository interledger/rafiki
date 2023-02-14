import { TransactionOrKnex } from 'objection'
import { UniqueViolationError } from 'objection-db-errors'
import { BaseService } from '../../../shared/baseService'
import { TransferError } from '../../errors'
import { LedgerTransfer, LedgerTransferState } from './model'

interface GetTransfersResult {
  credits: LedgerTransfer[]
  debits: LedgerTransfer[]
}

export type CreateTransferArgs = Pick<
  LedgerTransfer,
  | 'amount'
  | 'transferRef'
  | 'creditAccountId'
  | 'debitAccountId'
  | 'ledger'
  | 'expiresAt'
  | 'type'
  | 'state'
>

export interface LedgerTransferService {
  getAccountTransfers(
    accountId: string,
    trx?: TransactionOrKnex
  ): Promise<GetTransfersResult>
  createTransfers(
    transfers: CreateTransferArgs[],
    trx?: TransactionOrKnex
  ): Promise<TransferError | void>
}

type ServiceDependencies = BaseService

export async function createLedgerTransferService({
  logger,
  knex
}: ServiceDependencies): Promise<LedgerTransferService> {
  const log = logger.child({
    service: 'LedgerTransferService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }
  return {
    getAccountTransfers: (accountId, trx) =>
      getAccountTransfers(deps, accountId, trx),
    createTransfers: (transfers, trx) => createTransfers(deps, transfers, trx)
  }
}

async function getAccountTransfers(
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

async function createTransfers(
  deps: ServiceDependencies,
  transfers: CreateTransferArgs[],
  trx?: TransactionOrKnex
): Promise<TransferError | void> {
  await LedgerTransfer.query(trx || deps.knex).insertAndFetch(transfers)
}
