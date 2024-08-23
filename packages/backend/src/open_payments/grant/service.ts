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
  getOrCreate(options: GrantOptions): Promise<Grant | GrantError>
  delete(id: string): Promise<Grant>
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
    getOrCreate: (options) => getOrCreateGrant(deps, options),
    delete: (id) => deleteGrant(deps, id)
  }
}

interface GrantOptions {
  authServer: string
  accessType: AccessType
  accessActions: AccessAction[]
}

interface UpdateOptions {
  accessToken: string
  managementUrl: string
  expiresIn?: number
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
  const existingGrant = await getExistingGrant(deps, options)

  if (!existingGrant) {
    return requestNewGrant(deps, options)
  }

  if (existingGrant.expired) {
    return (
      (await rotateTokenAndUpdateGrant(deps, existingGrant)) ??
      (await requestNewGrant(deps, options))
    )
  }

  return existingGrant
}

export async function getExistingGrant(
  deps: ServiceDependencies,
  options: GrantOptions
): Promise<Grant | undefined> {
  return await Grant.query(deps.knex)
    .findOne({
      accessType: options.accessType
    })
    .whereNull('deletedAt')
    .andWhere('authServer.url', options.authServer)
    // all options.accessActions are a subset of saved accessActions
    // e.g. if [ReadAll, Create] is saved, requesting just [Create] would still match
    .andWhere('accessActions', '@>', options.accessActions)
    .withGraphJoined('authServer')
}

async function requestNewGrant(
  deps: ServiceDependencies,
  options: GrantOptions
): Promise<Grant | GrantError> {
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
      accessActions: addSubsetActions(options.accessActions),
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

async function rotateTokenAndUpdateGrant(
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

function addSubsetActions(accessActions: AccessAction[]): AccessAction[] {
  const newAccessActions = [...accessActions]

  // Read is a subset action of ReadAll
  if (
    accessActions.includes(AccessAction.ReadAll) &&
    !accessActions.includes(AccessAction.Read)
  ) {
    newAccessActions.push(AccessAction.Read)
  }

  // List is a subset action of ListAll
  if (
    accessActions.includes(AccessAction.ListAll) &&
    !accessActions.includes(AccessAction.List)
  ) {
    newAccessActions.push(AccessAction.List)
  }

  return newAccessActions
}

function retrieveManagementId(managementUrl: string): string {
  const managementUrlParts = managementUrl.split('/')
  const managementId = managementUrlParts.pop() || managementUrlParts.pop() // handle trailing slash
  if (!managementId) {
    throw new Error('invalid management id')
  }
  return managementId
}
