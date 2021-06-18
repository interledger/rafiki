import { Account } from './model'
import { BaseService } from '../shared/baseService'

export interface AccountService {
  get(id: string): Promise<Account>
  create(scale: number, currency: string): Promise<Account>
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
    create: (scale, currency) => createAccount(deps, scale, currency)
  }
}

async function getAccount(
  deps: ServiceDependencies,
  id: string
): Promise<Account> {
  deps.logger.info('returns an account')
  return Account.query(deps.knex).findById(id)
}

async function createAccount(
  deps: ServiceDependencies,
  scale: number,
  currency: string
): Promise<Account> {
  deps.logger.info('Creates an account')
  // TODO: Create account in connector here (when connector account setup).
  return Account.query(deps.knex).insertAndFetch({
    scale: scale,
    currency: currency
  })
}
