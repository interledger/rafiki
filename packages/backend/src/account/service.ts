import { Account } from './model'
import { BaseService } from '../shared/baseService'
import { strictEqual } from 'assert'

export interface AccountService {
  get(id: string): Promise<Account>
  create(scale: number, currency: string): Promise<Account>
  createSubAccount(superAccountId: string): Promise<Account>
}

type ServiceDependencies = BaseService

export async function createAccountService({
  logger,
  knex
}: BaseService): Promise<AccountService> {
  const log = logger.child({
    service: 'AccountService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex: knex
  }
  return {
    get: (id) => getAccount(deps, id),
    create: (scale, currency) => createAccount(deps, scale, currency),
    createSubAccount: (superAccountId) => createSubAccount(deps, superAccountId)
  }
}

async function getAccount(
  deps: ServiceDependencies,
  id: string
): Promise<Account> {
  return Account.query(deps.knex).findById(id)
}

async function createAccount(
  deps: ServiceDependencies,
  scale: number,
  currency: string
): Promise<Account> {
  // TODO: Create account in connector here (when connector account setup).
  return Account.query(deps.knex).insertAndFetch({
    scale: scale,
    currency: currency
  })
}

async function createSubAccount(
  deps: ServiceDependencies,
  superAccountId: string
): Promise<Account> {
  // TODO: Create account in connector here (when connector account setup).
  const parentAccount = await getAccount(deps, superAccountId)

  strictEqual(
    parentAccount.id,
    superAccountId,
    'parent account does not match what was requested'
  )

  return Account.query(deps.knex).insertAndFetch({
    scale: parentAccount.scale,
    currency: parentAccount.currency,
    superAccountId: superAccountId
  })
}
