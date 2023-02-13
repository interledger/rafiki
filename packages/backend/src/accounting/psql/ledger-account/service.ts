import { TransactionOrKnex, UniqueViolationError } from 'objection'

import { BaseService } from '../../../shared/baseService'
import { LedgerAccount, LedgerAccountType } from './model'
import { AccountAlreadyExistsError } from '../../errors'

interface CreateArgs {
  accountRef: string
  ledger: number
  type: LedgerAccountType
}

export interface LedgerAccountService {
  create(args: CreateArgs, trx?: TransactionOrKnex): Promise<LedgerAccount>
  getLiquidityAccount(accountRef: string): Promise<LedgerAccount | undefined>
  getSettlementAccount(accountRef: string): Promise<LedgerAccount | undefined>
}

type ServiceDependencies = BaseService

export async function createLedgerAccountService({
  logger,
  knex
}: ServiceDependencies): Promise<LedgerAccountService> {
  const log = logger.child({
    service: 'LedgerAccountService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex
  }
  return {
    create: (args, trx) => create(deps, args, trx),
    getLiquidityAccount: (args) => getLiquidityAccount(deps, args),
    getSettlementAccount: (args) => getSettlementAccount(deps, args)
  }
}

async function create(
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

async function getLiquidityAccount(
  deps: ServiceDependencies,
  accountRef: string
): Promise<LedgerAccount | undefined> {
  return LedgerAccount.query(deps.knex)
    .findOne({ accountRef })
    .whereNot({ type: LedgerAccountType.SETTLEMENT })
}

async function getSettlementAccount(
  deps: ServiceDependencies,
  accountRef: string
): Promise<LedgerAccount | undefined> {
  return LedgerAccount.query(deps.knex)
    .findOne({ accountRef })
    .where({ type: LedgerAccountType.SETTLEMENT })
}
