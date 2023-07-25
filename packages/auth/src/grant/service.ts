import { v4 } from 'uuid'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { generateNonce, generateToken } from '../shared/utils'
import {
  Grant,
  GrantState,
  StartMethod,
  FinishMethod,
  PendingGrant,
  isPendingGrant
} from './model'
import { AccessRequest } from '../access/types'
import { AccessService } from '../access/service'
import { Pagination } from '../shared/baseModel'
import { FilterString } from '../shared/filters'
import { AccessTokenService } from '../accessToken/service'

export interface GrantService {
  getByIdWithAccess(grantId: string): Promise<Grant | undefined>
  create(grantRequest: GrantRequest, trx?: Transaction): Promise<Grant>
  getByInteractionSession(
    interactId: string,
    interactNonce: string,
    options?: GetByInteractionSessionOpts
  ): Promise<PendingGrant | undefined>
  issueGrant(grantId: string): Promise<Grant>
  getByContinue(
    continueId: string,
    continueToken: string,
    options?: GetByContinueOpts
  ): Promise<Grant | null>
  rejectGrant(grantId: string): Promise<Grant | null>
  revokeGrant(grantId: string): Promise<boolean>
  getPage(pagination?: Pagination, filter?: GrantFilter): Promise<Grant[]>
  lock(grantId: string, trx: Transaction, timeoutMs?: number): Promise<void>
}

interface ServiceDependencies extends BaseService {
  accessService: AccessService
  accessTokenService: AccessTokenService
  knex: TransactionOrKnex
}

// datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-2
export interface GrantRequest {
  access_token: {
    access: AccessRequest[]
  }
  client: string
  interact?: {
    start: StartMethod[]
    finish?: {
      method: FinishMethod
      uri: string
      nonce: string
    }
  }
}

export interface GrantResponse {
  interact: {
    redirect: string
    finish: string
  }
  continue: {
    access_token: {
      value: string
    }
    uri: string
    wait: number
  }
}

interface FilterGrantState {
  notIn?: GrantState[]
}
interface GrantFilter {
  identifier?: FilterString
  state?: FilterGrantState
}

export async function createGrantService({
  logger,
  accessService,
  accessTokenService,
  knex
}: ServiceDependencies): Promise<GrantService> {
  const log = logger.child({
    service: 'GrantService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    accessService,
    accessTokenService,
    knex
  }
  return {
    getByIdWithAccess: (grantId: string) => getByIdWithAccess(grantId),
    create: (grantRequest: GrantRequest, trx?: Transaction) =>
      create(deps, grantRequest, trx),
    getByInteractionSession: (
      interactId: string,
      interactNonce: string,
      options: GetByInteractionSessionOpts
    ) => getByInteractionSession(interactId, interactNonce, options),
    issueGrant: (grantId: string) => issueGrant(deps, grantId),
    getByContinue: (
      continueId: string,
      continueToken: string,
      options: GetByContinueOpts
    ) => getByContinue(continueId, continueToken, options),
    rejectGrant: (grantId: string) => rejectGrant(deps, grantId),
    revokeGrant: (grantId: string) => revokeGrant(deps, grantId),
    getPage: (pagination?, filter?) => getGrantsPage(deps, pagination, filter),
    lock: (grantId: string, trx: Transaction, timeoutMs?: number) =>
      lock(deps, grantId, trx, timeoutMs)
  }
}

async function getByIdWithAccess(grantId: string): Promise<Grant | undefined> {
  return Grant.query().findById(grantId).withGraphJoined('access')
}

async function issueGrant(
  deps: ServiceDependencies,
  grantId: string
): Promise<Grant> {
  return Grant.query().patchAndFetchById(grantId, {
    state: GrantState.Granted
  })
}

async function rejectGrant(
  deps: ServiceDependencies,
  grantId: string
): Promise<Grant | null> {
  return Grant.query(deps.knex).patchAndFetchById(grantId, {
    state: GrantState.Rejected
  })
}

async function revokeGrant(
  deps: ServiceDependencies,
  grantId: string
): Promise<boolean> {
  const { accessTokenService, accessService } = deps

  const trx = await deps.knex.transaction()

  try {
    const grant = await Grant.query(trx)
      .patchAndFetchById(grantId, { state: GrantState.Revoked })
      .first()

    if (!grant) {
      deps.logger.info(
        `Could not revoke grant corresponding to grantId: ${grantId}`
      )
      await trx.rollback()
      return false
    }

    await accessTokenService.revokeByGrantId(grant.id, trx)
    await accessService.revokeByGrantId(grant.id, trx)

    await trx.commit()
    return true
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

async function create(
  deps: ServiceDependencies,
  grantRequest: GrantRequest,
  trx?: Transaction
): Promise<Grant> {
  const { accessService, knex } = deps

  const {
    access_token: { access },
    interact,
    client
  } = grantRequest

  const grantTrx = trx || (await Grant.startTransaction(knex))
  try {
    const grant = await Grant.query(grantTrx).insert({
      state: interact ? GrantState.Pending : GrantState.Granted,
      startMethod: interact?.start,
      finishMethod: interact?.finish?.method,
      finishUri: interact?.finish?.uri,
      clientNonce: interact?.finish?.nonce,
      client,
      interactId: interact ? v4() : undefined,
      interactRef: interact ? v4() : undefined,
      interactNonce: interact ? generateNonce() : undefined,
      continueId: v4(),
      continueToken: generateToken()
    })

    // Associate provided accesses with grant
    await accessService.createAccess(grant.id, access, grantTrx)

    if (!trx) {
      await grantTrx.commit()
    }

    return grant
  } catch (err) {
    if (!trx) {
      await grantTrx.rollback()
    }

    throw err
  }
}

interface GetByInteractionSessionOpts {
  includeRevoked?: boolean
}

async function getByInteractionSession(
  interactId: string,
  interactNonce: string,
  options: GetByInteractionSessionOpts = {}
): Promise<PendingGrant | undefined> {
  const { includeRevoked = false } = options

  const queryBuilder = Grant.query()
    .findOne({ interactId, interactNonce })
    .withGraphFetched('access')

  if (!includeRevoked) {
    queryBuilder.whereNot('state', GrantState.Revoked)
  }

  const grant = await queryBuilder

  if (!grant || !isPendingGrant(grant)) {
    return undefined
  } else {
    return grant
  }
}

interface GetByContinueOpts {
  interactRef?: string
  includeRevoked?: boolean
}

async function getByContinue(
  continueId: string,
  continueToken: string,
  options: GetByContinueOpts = {}
): Promise<Grant | null> {
  const { interactRef, includeRevoked = false } = options

  const queryBuilder = Grant.query().findOne({ continueId })

  if (!includeRevoked) {
    queryBuilder.whereNot('state', GrantState.Revoked)
  }

  const grant = await queryBuilder

  if (
    continueToken !== grant?.continueToken ||
    (interactRef && interactRef !== grant?.interactRef)
  )
    return null
  return grant
}

async function getGrantsPage(
  deps: ServiceDependencies,
  pagination?: Pagination,
  filter?: GrantFilter
): Promise<Grant[]> {
  const query = Grant.query(deps.knex).withGraphJoined('access')
  const { identifier, state } = filter ?? {}

  if (identifier?.in?.length) {
    query.whereIn('access.identifier', identifier.in)
  }

  if (state?.notIn?.length) {
    query.whereNotIn('state', state.notIn)
  }

  return query.getPage(pagination)
}

async function lock(
  deps: ServiceDependencies,
  grantId: string,
  trx: Transaction,
  timeoutMs?: number
): Promise<void> {
  const grants = await trx<Grant>(Grant.tableName)
    .select()
    .where('id', grantId)
    .forNoKeyUpdate()
    .timeout(timeoutMs ?? 5000)

  if (grants.length <= 0) {
    deps.logger.warn(
      `No grant found when attempting to lock grantId: ${grantId}`
    )
  }
}
