import { TransactionOrKnex } from 'objection'
import { BaseService } from '../../../shared/baseService'
import { LedgerTransfer, LedgerTransferState } from './model'

export interface LedgerTransferService {
  getAccountTransfers(
    accountId: string,
    trx?: TransactionOrKnex
  ): Promise<LedgerTransfer[]>
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
      getAccountTransfers(deps, accountId, trx)
  }
}

async function getAccountTransfers(
  deps: ServiceDependencies,
  accountId: string,
  trx?: TransactionOrKnex
): Promise<LedgerTransfer[]> {
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

  return transfers
}
