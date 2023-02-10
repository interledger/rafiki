import { v4 as uuid } from 'uuid'
import { TransactionOrKnex } from 'objection'
import {
  LedgerTransfer,
  LedgerTransferState,
  LedgerTransferType
} from '../accounting/psql/ledger-transfer/model'

interface CreateLedgerTransferArgs {
  transferRef?: string
  amount?: bigint
  assetId: string
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
    assetId,
    creditAccountId,
    debitAccountId,
    state,
    type,
    expiresAt
  } = args

  return LedgerTransfer.query(knex).insertAndFetch({
    transferRef: transferRef ?? uuid(),
    creditAccountId: creditAccountId,
    debitAccountId: debitAccountId,
    amount: amount ?? 10n,
    expiresAt,
    assetId,
    state: state ?? LedgerTransferState.POSTED,
    type
  })
}
