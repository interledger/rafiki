import { Grant } from './model'
import { AuthServerService } from '../authServer/service'
import { BaseService } from '../../shared/baseService'
import {
  AccessAction,
  AccessToken,
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
  delete(id: string): Promise<Grant | GrantError>
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
    getOrCreate: (options) => getOrCreateGrant(deps, options),
    delete: (id) => deleteGrant(deps, id)
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

async function getOrCreateGrant(
  deps: ServiceDependencies,
  options: GrantOptions
): Promise<Grant | GrantError> {
  const existingGrant = await Grant.query(deps.knex)
    .findOne({
      accessType: options.accessType
    })
    .whereNull('deletedAt')
    .andWhere('authServer.url', options.authServer)
    .andWhere('accessActions', '@>', options.accessActions) // all options.accessActions are a subset of saved accessActions
    .withGraphJoined('authServer')

  if (existingGrant?.expired) {
    const updatedGrant = await rotateGrantToken(deps, existingGrant)
    if (updatedGrant) {
      return updatedGrant
    }
  } else if (existingGrant) {
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

async function rotateGrantToken(
  deps: ServiceDependencies,
  grant: Grant
): Promise<Grant | undefined> {
  if (!grant.authServer) {
    deps.logger.error(
      { grantId: grant.id },
      'Could not get auth server from grant during token rotation'
    )
    return undefined
  }

  let rotatedToken: AccessToken

  try {
    rotatedToken = await deps.openPaymentsClient.token.rotate({
      url: grant.getManagementUrl(grant.authServer.url),
      accessToken: grant.accessToken
    })
  } catch (err) {
    deps.logger.warn(
      { err, authServerUrl: grant.authServer.url },
      'Grant token rotation failed'
    )
    await deleteGrant(deps, grant.id)
    return undefined
  }

  return updateGrant(deps, grant, {
    accessToken: rotatedToken.access_token.value,
    managementUrl: rotatedToken.access_token.manage,
    expiresIn: rotatedToken.access_token.expires_in
  })
}

async function deleteGrant(
  deps: ServiceDependencies,
  grantId: string
): Promise<Grant> {
  return Grant.query(deps.knex).updateAndFetchById(grantId, {
    deletedAt: new Date()
  })
}

function retrieveManagementId(managementUrl: string): string {
  const managementUrlParts = managementUrl.split('/')
  const managementId = managementUrlParts.pop() || managementUrlParts.pop() // handle trailing slash
  if (!managementId) {
    throw new Error('invalid management id')
  }
  return managementId
}
