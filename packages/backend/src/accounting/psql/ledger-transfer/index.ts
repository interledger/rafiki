import { TransactionOrKnex } from 'objection'
import { LedgerTransfer, LedgerTransferState } from './model'
import { ServiceDependencies } from '../service'

interface GetTransfersResult {
  credits: LedgerTransfer[]
  debits: LedgerTransfer[]
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
