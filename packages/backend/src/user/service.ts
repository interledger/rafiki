import { User } from './model'
import { AccountService } from '../account/service'
import { BaseService } from '../shared/baseService'

export interface UserService {
  get(id: string): Promise<User>
  create(id?: string): Promise<User>
}

interface ServiceDependencies extends BaseService {
  accountService: AccountService
}

export async function createUserService({
  logger,
  knex,
  accountService
}: ServiceDependencies): Promise<UserService> {
  const log = logger.child({
    service: 'UserService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex: knex,
    accountService: accountService
  }
  return {
    get: (id) => getUser(deps, id),
    create: (id) => createUser(deps, id)
  }
}

async function getUser(deps: ServiceDependencies, id: string): Promise<User> {
  return User.query(deps.knex).findById(id)
}

async function createUser(
  deps: ServiceDependencies,
  id?: string
): Promise<User> {
  const account = await deps.accountService.create(6, 'USD')
  return User.query(deps.knex).insertAndFetch({
    id: id,
    accountId: account.id
  })
}
