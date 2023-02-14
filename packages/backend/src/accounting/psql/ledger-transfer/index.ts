import { TransactionOrKnex } from 'objection'
import { LedgerTransfer, LedgerTransferState } from './model'
import { ServiceDependencies } from '../service'

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
  | 'type'
> & {
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

export async function createTransfers(
  _: ServiceDependencies,
  transfers: CreateTransferArgs[],
  trx: TransactionOrKnex
): Promise<void> {
  await LedgerTransfer.query(trx).insertAndFetch(transfers.map(prepareTransfer))
}

function prepareTransfer(
  transfer: CreateTransferArgs
): Partial<LedgerTransfer> {
  return {
    amount: transfer.amount,
    transferRef: transfer.transferRef,
    creditAccountId: transfer.creditAccountId,
    debitAccountId: transfer.debitAccountId,
    ledger: transfer.ledger,
    state:
      transfer.timeoutMs != null
        ? LedgerTransferState.PENDING
        : LedgerTransferState.POSTED,
    expiresAt:
      transfer.timeoutMs != null
        ? new Date(Date.now() + Number(transfer.timeoutMs))
        : undefined,
    type: transfer.type
  }
}
