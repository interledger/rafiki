import { TransactionOrKnex } from 'objection'
import {
  LedgerTransfer,
  LedgerTransferState,
  LedgerTransferType
} from '../accounting/psql/ledger-transfer/model'

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
    expiresAt,
    ledger,
    state: state ?? LedgerTransferState.POSTED,
    type
  })
}
