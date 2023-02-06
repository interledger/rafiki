import { UniqueViolationError } from 'objection'

import { BaseService } from '../../../shared/baseService'
import { LedgerAccount } from './model'
import { AccountType } from '../../service'
import { AccountAlreadyExistsError } from '../../errors'

export interface CreateArgs {
  accountRef: string
  assetId: string
  type: AccountType
}

export interface LedgerAccountService {
  create(options: CreateArgs): Promise<LedgerAccount>
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
    create: (options) => create(deps, options)
  }
}

async function create(
  _: ServiceDependencies,
  args: CreateArgs
): Promise<LedgerAccount> {
  try {
    const { accountRef, assetId, type } = args
    return await LedgerAccount.transaction(async (trx) => {
      return LedgerAccount.query(trx).insertAndFetch({
        assetId,
        accountRef,
        type
      })
    })
  } catch (err) {
    if (err instanceof UniqueViolationError) {
      throw new AccountAlreadyExistsError(`accountRef: ${args.accountRef}`)
    }
    throw err
  }
}
