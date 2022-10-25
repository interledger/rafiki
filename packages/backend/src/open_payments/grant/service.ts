import { AccessType, AccessAction } from 'auth'

import { Grant } from './model'
import { AuthServerService } from '../authServer/service'
import { BaseService } from '../../shared/baseService'

export interface GrantService {
  create(options: GrantOptions): Promise<Grant>
  get(options: GrantOptions): Promise<Grant | undefined>
}

export interface ServiceDependencies extends BaseService {
  authServerService: AuthServerService
}

export async function createGrantService(
  deps_: ServiceDependencies
): Promise<GrantService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({
      service: 'GrantService'
    })
  }

  return {
    get: (options) => getGrant(deps, options),
    create: (options) => createGrant(deps, options)
  }
}

export interface GrantOptions {
  authServer: string
  accessType: AccessType
  accessActions: AccessAction[]
}

async function createGrant(deps: ServiceDependencies, options: GrantOptions) {
  const { id: authServerId } = await deps.authServerService.getOrCreate(
    options.authServer
  )
  return Grant.query(deps.knex).insertAndFetch({
    accessType: options.accessType,
    accessActions: options.accessActions,
    authServerId
  })
}

async function getGrant(deps: ServiceDependencies, options: GrantOptions) {
  return Grant.query(deps.knex)
    .findOne({
      accessType: options.accessType,
      accessActions: options.accessActions
    })
    .withGraphJoined('authServer')
    .where('authServer.url', options.authServer)
}
