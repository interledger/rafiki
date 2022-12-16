import { UniqueViolationError } from 'objection'

import { AuthServer } from './model'
import { BaseService } from '../../shared/baseService'

export interface AuthServerService {
  getOrCreate(url: string): Promise<AuthServer>
}

type ServiceDependencies = BaseService

export async function createAuthServerService(
  deps_: ServiceDependencies
): Promise<AuthServerService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({
      service: 'AuthServerService'
    })
  }
  return {
    getOrCreate: (url) => getOrCreateAuthServer(deps, url)
  }
}

async function getOrCreateAuthServer(
  deps: ServiceDependencies,
  url: string
): Promise<AuthServer> {
  try {
    return await AuthServer.query(deps.knex).insertAndFetch({
      url
    })
  } catch (err) {
    if (err instanceof UniqueViolationError) {
      return await AuthServer.query(deps.knex).findOne({ url })
    }
    throw err
  }
}
