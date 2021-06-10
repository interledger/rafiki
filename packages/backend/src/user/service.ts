import { Logger as PinoLogger } from '../logger/service'
import { User } from './model'
import { TransactionOrKnex } from 'objection'

type Logger = typeof PinoLogger

export interface UserService {
  get(id: string): Promise<User>
  create(): Promise<User>
}

interface ServiceDependencies {
  logger: Logger
  knex: TransactionOrKnex
}

export async function createUserService(
  logger: Logger,
  knex: TransactionOrKnex
): Promise<UserService> {
  const log = logger.child({
    service: 'UserService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex: knex
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
  return User.query(deps.knex).insertAndFetch({})
}
