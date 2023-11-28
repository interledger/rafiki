import { TransactionOrKnex, UniqueViolationError } from 'objection'

import { LedgerAccount, LedgerAccountType } from './model'
import { AccountAlreadyExistsError } from '../../errors'
import { ServiceDependencies } from '../service'

interface CreateArgs {
  accountRef: string
  ledger: number
  type: LedgerAccountType
}

export async function createAccount(
  deps: ServiceDependencies,
  args: CreateArgs,
  trx?: TransactionOrKnex
): Promise<LedgerAccount> {
  try {
    const { accountRef, ledger, type } = args
    return await LedgerAccount.query(trx || deps.knex).insertAndFetch({
      ledger,
      accountRef,
      type
    })
  } catch (err) {
    if (err instanceof UniqueViolationError) {
      throw new AccountAlreadyExistsError(`accountRef: ${args.accountRef}`)
    }
    throw err
  }
}

export async function getLiquidityAccount(
  deps: ServiceDependencies,
  accountRef: string,
  trx?: TransactionOrKnex
): Promise<LedgerAccount | undefined> {
  return LedgerAccount.query(trx ?? deps.knex)
    .findOne({ accountRef })
    .whereNot({ type: LedgerAccountType.SETTLEMENT })
}

export async function getSettlementAccount(
  deps: ServiceDependencies,
  accountRef: string,
  trx?: TransactionOrKnex
): Promise<LedgerAccount | undefined> {
  return LedgerAccount.query(trx ?? deps.knex)
    .findOne({ accountRef })
    .where({ type: LedgerAccountType.SETTLEMENT })
}
