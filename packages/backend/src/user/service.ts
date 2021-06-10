import { Logger as PinoLogger } from '../logger/service'
import { User } from './model'

type Logger = typeof PinoLogger

export interface UserService {
  get(id: string): Promise<User>
}

interface ServiceDependencies {
  logger: Logger
}

export async function createUserService(logger: Logger): Promise<UserService> {
  const log = logger.child({
    service: 'UserService'
  })
  const deps: ServiceDependencies = {
    logger: log
  }
  return {
    get: (id) => getUser(deps, id)
  }
}

async function getUser(deps: ServiceDependencies, id: string): Promise<User> {
  deps.logger.info('returns user id')
  return User.query().findById(id)
}
