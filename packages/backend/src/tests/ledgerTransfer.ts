import { TransactionOrKnex } from 'objection'
import {
  LedgerTransfer,
  LedgerTransferType
} from '../accounting/psql/ledger-transfer/model'
import { LedgerTransferState } from '../accounting/service'

interface CreateLedgerTransferArgs {
  transferRef?: string
  amount?: bigint
  ledger: number
  creditAccountId: string
  debitAccountId: string
  state?: LedgerTransferState
  type?: LedgerTransferType
  expiresAt?: Date
}

export const createLedgerTransfer = async (
  args: CreateLedgerTransferArgs,
  knex: TransactionOrKnex
): Promise<LedgerTransfer> => {
  const {
    amount,
    transferRef,
    ledger,
    creditAccountId,
    debitAccountId,
    state,
    type,
    expiresAt
  } = args

  return LedgerTransfer.query(knex).insertAndFetch({
    transferRef,
    creditAccountId: creditAccountId,
    debitAccountId: debitAccountId,
    amount: amount ?? 10n,
    ledger,
    state: state ?? LedgerTransferState.POSTED,
    expiresAt:
      expiresAt ??
      (state === LedgerTransferState.PENDING
        ? new Date(Date.now() + 86_400_000)
        : undefined),
    type
  })
}
