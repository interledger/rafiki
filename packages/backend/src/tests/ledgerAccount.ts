import { v4 as uuid } from 'uuid'
import { TransactionOrKnex } from 'objection'
import {
  LedgerAccount,
  LedgerAccountType
} from '../accounting/psql/ledger-account/model'

interface CreateLedgerAccountArgs {
  accountRef?: string
  ledger: number
  type?: LedgerAccountType
}

export const createLedgerAccount = async (
  args: CreateLedgerAccountArgs,
  knex: TransactionOrKnex
): Promise<LedgerAccount> => {
  const { accountRef, ledger, type } = args

  return LedgerAccount.query(knex).insertAndFetch({
    accountRef: accountRef ?? uuid(),
    ledger,
    type: type ?? LedgerAccountType.LIQUIDITY_INCOMING
  })
}
