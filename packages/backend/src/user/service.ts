import { User } from './model'
import { AccountService, createAccountService } from '../account/service'
import { BaseService } from '../shared/baseService'

export interface UserService {
  get(id: string): Promise<User>
  create(): Promise<User>
}

interface ServiceDependencies extends BaseService {
  accountService: AccountService
}

export async function createUserService({
  logger,
  knex
}: BaseService): Promise<UserService> {
  const log = logger.child({
    service: 'UserService'
  })
  const accountService = await createAccountService({
    logger: logger,
    knex: knex
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex: knex,
    accountService: accountService
  }
  return {
    get: (id) => getUser(deps, id),
    create: () => createUser(deps)
  }
}

async function getUser(deps: ServiceDependencies, id: string): Promise<User> {
  deps.logger.info('returns a user')
  return User.query(deps.knex).findById(id)
}

async function createUser(deps: ServiceDependencies): Promise<User> {
  deps.logger.info('Creates a user')
  const account = await deps.accountService.create(6, 'USD')
  return User.query(deps.knex).insertAndFetch({
    accountId: account.id
  })
}
