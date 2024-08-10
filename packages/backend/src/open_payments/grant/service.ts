import { Grant } from './model'
import { AuthServerService } from '../authServer/service'
import { BaseService } from '../../shared/baseService'
import {
  AccessAction,
  AccessType,
  AuthenticatedClient,
  isPendingGrant
} from '@interledger/open-payments'
import { GrantError } from './errors'

export interface GrantService {
  create(options: CreateOptions): Promise<Grant>
  get(options: GrantOptions): Promise<Grant | undefined>
  update(grant: Grant, options: UpdateOptions): Promise<Grant>
  getOrCreate(options: GrantOptions): Promise<Grant | GrantError>
}

export interface ServiceDependencies extends BaseService {
  authServerService: AuthServerService
  openPaymentsClient: AuthenticatedClient
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
    update: (grant, options) => updateGrant(deps, grant, options),
    getOrCreate: (options) => getOrCreate(deps, options)
  }
}

export interface GrantOptions {
  authServer: string
  accessType: AccessType
  accessActions: AccessAction[]
}

export interface UpdateOptions {
  accessToken: string
  managementUrl: string
  expiresIn?: number
}

export type CreateOptions = GrantOptions & UpdateOptions

async function createGrant(deps: ServiceDependencies, options: CreateOptions) {
  const { id: authServerId } = await deps.authServerService.getOrCreate(
    options.authServer
  )
  return Grant.query(deps.knex)
    .insertAndFetch({
      accessType: options.accessType,
      accessActions: options.accessActions,
      accessToken: options.accessToken,
      managementId: retrieveManagementId(options.managementUrl),
      authServerId,
      expiresAt: options.expiresIn
        ? new Date(Date.now() + options.expiresIn * 1000)
        : undefined
    })
    .withGraphFetched('authServer')
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
  return grant
    .$query(deps.knex)
    .updateAndFetch({
      accessToken: options.accessToken,
      managementId: retrieveManagementId(options.managementUrl),
      expiresAt: options.expiresIn
        ? new Date(Date.now() + options.expiresIn * 1000)
        : null
    })
    .withGraphFetched('authServer')
}

async function getOrCreate(
  deps: ServiceDependencies,
  options: GrantOptions
): Promise<Grant | GrantError> {
  const existingGrant = await Grant.query(deps.knex)
    .findOne({
      accessType: options.accessType,
      accessActions: options.accessActions // where options.accessActions subset of accessActions
    })
    .withGraphJoined('authServer')
    .where('authServer.url', options.authServer)
    .andWhere('expiresAt', '>', new Date())

  if (existingGrant) {
    return existingGrant
  }

  let openPaymentsGrant
  try {
    openPaymentsGrant = await deps.openPaymentsClient.grant.request(
      { url: options.authServer },
      {
        access_token: {
          access: [
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: options.accessType as any,
              actions: options.accessActions
            }
          ]
        },
        interact: {
          start: ['redirect']
        }
      }
    )
  } catch (err) {
    deps.logger.error(
      { err, options },
      'Received error requesting Open Payments grant'
    )
    return GrantError.InvalidGrantRequest
  }

  if (isPendingGrant(openPaymentsGrant)) {
    deps.logger.error({ ...options }, 'Requested grant requires interaction')
    return GrantError.GrantRequiresInteraction
  }

  const { id: authServerId } = await deps.authServerService.getOrCreate(
    options.authServer
  )

  return Grant.query(deps.knex)
    .insertAndFetch({
      accessType: options.accessType,
      accessActions: options.accessActions,
      accessToken: openPaymentsGrant.access_token.value,
      managementId: retrieveManagementId(openPaymentsGrant.access_token.manage),
      authServerId,
      expiresAt: openPaymentsGrant.access_token.expires_in
        ? new Date(
            Date.now() + openPaymentsGrant.access_token.expires_in * 1000
          )
        : undefined
    })
    .withGraphFetched('authServer')
}

function retrieveManagementId(managementUrl: string): string {
  const managementUrlParts = managementUrl.split('/')
  const managementId = managementUrlParts.pop() || managementUrlParts.pop() // handle trailing slash
  if (!managementId) {
    throw new Error('invalid management id')
  }
  return managementId
}
