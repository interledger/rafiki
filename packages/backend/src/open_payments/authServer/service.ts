import { Transaction, UniqueViolationError } from 'objection'

import { AuthServer } from './model'
import { BaseService } from '../../shared/baseService'

export interface AuthServerService {
  getOrCreate(url: string): Promise<AuthServer>
  lock(id: string, trx: Transaction): Promise<void>
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
    getOrCreate: (url) => getOrCreateAuthServer(deps, url),
    lock: (id, trx) => lockAuthServer(id, trx)
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

async function lockAuthServer(id: string, trx: Transaction) {
  // TODO: update to use objection once it supports forNoKeyUpdate
  await trx<AuthServer>('authServers')
    .select()
    .where({ id })
    .forNoKeyUpdate()
    .timeout(5000)
}
