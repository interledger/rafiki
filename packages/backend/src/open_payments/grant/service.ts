import { Grant } from './model'
import { AuthServerService } from '../authServer/service'
import { BaseService } from '../../shared/baseService'
import { AccessAction, AccessType } from 'open-payments'

export interface GrantService {
  create(options: CreateOptions): Promise<Grant>
  get(options: GrantOptions): Promise<Grant | undefined>
  update(grant: Grant, options: UpdateOptions): Promise<Grant>
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
    create: (options) => createGrant(deps, options),
    update: (grant, options) => updateGrant(deps, grant, options)
  }
}

export interface GrantOptions {
  authServer: string
  accessType: AccessType
  accessActions: AccessAction[]
}

export interface UpdateOptions {
  accessToken?: string
  managementUrl?: string
  expiresIn?: number
}

export type CreateOptions = GrantOptions & UpdateOptions

async function createGrant(deps: ServiceDependencies, options: CreateOptions) {
  const { id: authServerId } = await deps.authServerService.getOrCreate(
    options.authServer
  )
  return Grant.query(deps.knex).insertAndFetch({
    accessType: options.accessType,
    accessActions: options.accessActions,
    accessToken: options.accessToken,
    managementUrl: options.managementUrl,
    authServerId,
    expiresAt: options.expiresIn
      ? new Date(Date.now() + options.expiresIn * 1000)
      : undefined
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

async function updateGrant(
  deps: ServiceDependencies,
  grant: Grant,
  options: UpdateOptions
) {
  return grant.$query(deps.knex).updateAndFetch({
    accessToken: options.accessToken,
    managementUrl: options.managementUrl,
    expiresAt: options.expiresIn
      ? new Date(Date.now() + options.expiresIn * 1000)
      : undefined
  })
}
