import { UniqueViolationError } from 'objection'

import { BaseService } from '../../../shared/baseService'
import { LedgerAccount, LedgerAccountType } from './model'
import { AccountAlreadyExistsError } from '../../errors'

export interface CreateArgs {
  accountRef: string
  assetId: string
  type: LedgerAccountType
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
    create: (args) => create(deps, args)
  }
}

async function create(
  deps: ServiceDependencies,
  args: CreateArgs
): Promise<LedgerAccount> {
  try {
    const { accountRef, assetId, type } = args
    return await LedgerAccount.query(deps.knex).insertAndFetch({
      assetId,
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
