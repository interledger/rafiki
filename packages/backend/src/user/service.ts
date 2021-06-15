import { Logger as PinoLogger } from '../logger/service'
import { User } from './model'
import { TransactionOrKnex } from 'objection'
import { AccountService, createAccountService } from '../account/service'

type Logger = typeof PinoLogger

export interface UserService {
  get(id: string): Promise<User>
  create(): Promise<User>
}

interface ServiceDependencies {
  logger: Logger
  knex: TransactionOrKnex
  accountService: AccountService
}

export async function createUserService(
  logger: Logger,
  knex: TransactionOrKnex
): Promise<UserService> {
  const log = logger.child({
    service: 'UserService'
  })
  const accountService = await createAccountService(logger, knex)

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
