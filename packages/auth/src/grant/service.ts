import { v4 } from 'uuid'
import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { generateToken } from '../shared/utils'
import {
  Grant,
  GrantState,
  GrantFinalization,
  StartMethod,
  FinishMethod,
  isGrantWithTenant,
  GrantWithTenant
} from './model'
import { AccessRequest } from '../access/types'
import { AccessService } from '../access/service'
import { Pagination, SortOrder } from '../shared/baseModel'
import { FilterString } from '../shared/filters'
import { AccessTokenService } from '../accessToken/service'
import { canSkipInteraction } from './utils'
import { IAppConfig } from '../config/app'
import { SubjectRequest } from '../subject/types'
import { SubjectService } from '../subject/service'
import { isAccessError } from '../access/errors'
import { errorToMessage, GrantError, accessErrorToGrantError } from './errors'

interface GrantFilter {
  identifier?: FilterString
}

export interface GrantService {
  getByIdWithAccessAndSubject(
    grantId: string,
    tenantId?: string
  ): Promise<Grant | undefined>
  create(
    grantRequest: GrantRequest,
    tenantId: string,
    trx?: Transaction
  ): Promise<Grant>
  markPending(grantId: string, trx?: Transaction): Promise<GrantWithTenant>
  approve(grantId: string, trx?: Transaction): Promise<Grant>
  finalize(grantId: string, reason: GrantFinalization): Promise<Grant>
  getByContinue(
    continueId: string,
    continueToken: string,
    options?: GetByContinueOpts
  ): Promise<Grant | undefined>
  revokeGrant(grantId: string, tenantId?: string): Promise<boolean>
  getPage(
    pagination?: Pagination,
    filter?: GrantFilter,
    sortOrder?: SortOrder,
    tenantId?: string
  ): Promise<Grant[]>
  updateLastContinuedAt(id: string): Promise<Grant>
  lock(grantId: string, trx: Transaction, timeoutMs?: number): Promise<void>
}

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  accessService: AccessService
  accessTokenService: AccessTokenService
  subjectService: SubjectService
  knex: TransactionOrKnex
}

// datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-2
export interface GrantRequest {
  access_token?: {
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
  subject?: {
    sub_ids: SubjectRequest[]
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
  in?: GrantState[]
  notIn?: GrantState[]
}

interface FilterGrantFinalization {
  in?: GrantFinalization[]
  notIn?: GrantFinalization[]
}

interface GrantFilter {
  identifier?: FilterString
  state?: FilterGrantState
  finalizationReason?: FilterGrantFinalization
}

export async function createGrantService({
  config,
  logger,
  accessService,
  accessTokenService,
  subjectService,
  knex
}: ServiceDependencies): Promise<GrantService> {
  const log = logger.child({
    service: 'GrantService'
  })
  const deps: ServiceDependencies = {
    config,
    logger: log,
    accessService,
    accessTokenService,
    subjectService,
    knex
  }
  return {
    getByIdWithAccessAndSubject: (grantId: string, tenantId?: string) =>
      getByIdWithAccessAndSubject(grantId, tenantId),
    create: (grantRequest: GrantRequest, tenantId: string, trx?: Transaction) =>
      create(deps, grantRequest, tenantId, trx),
    markPending: (grantId: string, trx?: Transaction) =>
      markPending(deps, grantId, trx),
    approve: (grantId: string) => approve(grantId),
    finalize: (id: string, reason: GrantFinalization) => finalize(id, reason),
    getByContinue: (
      continueId: string,
      continueToken: string,
      opts: GetByContinueOpts
    ) => getByContinue(continueId, continueToken, opts),
    revokeGrant: (grantId: string, tenantId?: string) =>
      revokeGrant(deps, grantId, tenantId),
    getPage: (pagination?, filter?, sortOrder?, tenantId?) =>
      getGrantsPage(deps, pagination, filter, sortOrder, tenantId),
    updateLastContinuedAt: (id) => updateLastContinuedAt(id),
    lock: (grantId: string, trx: Transaction, timeoutMs?: number) =>
      lock(deps, grantId, trx, timeoutMs)
  }
}

async function getByIdWithAccessAndSubject(
  grantId: string,
  tenantId?: string
): Promise<Grant | undefined> {
  const query = Grant.query()
    .findById(grantId)
    .withGraphJoined('access')
    .withGraphJoined('subjects')

  if (tenantId) {
    query.where('tenantId', tenantId)
  }

  return query
}

async function approve(grantId: string): Promise<Grant> {
  return Grant.query().patchAndFetchById(grantId, {
    state: GrantState.Approved
  })
}

async function markPending(
  deps: ServiceDependencies,
  id: string,
  trx?: Transaction
): Promise<GrantWithTenant> {
  const grantTrx = trx || (await deps.knex.transaction())
  try {
    const grant = await Grant.query(trx)
      .patchAndFetchById(id, {
        state: GrantState.Pending
      })
      .withGraphFetched('tenant')

    if (!isGrantWithTenant(grant))
      throw new Error('required graph not returned in query')

    if (!trx) {
      await grantTrx.commit()
    }

    return grant
  } catch (err) {
    await grantTrx.rollback()
    throw err
  }
}

async function finalize(id: string, reason: GrantFinalization): Promise<Grant> {
  return Grant.query().patchAndFetchById(id, {
    state: GrantState.Finalized,
    finalizationReason: reason
  })
}

async function revokeGrant(
  deps: ServiceDependencies,
  grantId: string,
  tenantId?: string
): Promise<boolean> {
  const { accessTokenService } = deps

  const trx = await deps.knex.transaction()

  try {
    const queryBuilder = Grant.query(trx)
      .patchAndFetchById(grantId, {
        state: GrantState.Finalized,
        finalizationReason: GrantFinalization.Revoked
      })
      .first()

    if (tenantId) {
      queryBuilder.andWhere('tenantId', tenantId)
    }

    const grant = await queryBuilder

    if (!grant) {
      deps.logger.info(
        `Could not revoke grant corresponding to grantId: ${grantId}`
      )
      await trx.rollback()
      return false
    }

    await accessTokenService.revokeByGrantId(grant.id, trx)

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
  tenantId: string,
  trx?: Transaction
): Promise<Grant> {
  const { accessService, subjectService, knex } = deps
  const { access_token, interact, client, subject } = grantRequest

  const grantTrx = trx || (await Grant.startTransaction(knex))
  try {
    const grantData = {
      state: canSkipInteraction(deps.config, grantRequest)
        ? GrantState.Approved
        : GrantState.Pending,
      startMethod: interact?.start,
      finishMethod: interact?.finish?.method,
      finishUri: interact?.finish?.uri,
      clientNonce: interact?.finish?.nonce,
      client,
      continueId: v4(),
      continueToken: generateToken(),
      tenantId
    }

    const grant = await Grant.query(grantTrx).insert(grantData)

    // Associate provided accesses with grant
    if (access_token?.access)
      await accessService.createAccess(grant.id, access_token.access, grantTrx)

    if (subject?.sub_ids) {
      await subjectService.createSubject(grant.id, subject.sub_ids, grantTrx)
    }

    if (!trx) {
      await grantTrx.commit()
    }

    return grant
  } catch (err) {
    if (!trx) {
      await grantTrx.rollback()
    }
    if (isAccessError(err)) {
      const grantErr = accessErrorToGrantError[err]
      throw new GrantError(grantErr, errorToMessage[grantErr])
    }

    throw err
  }
}

interface GetByContinueOpts {
  includeRevoked?: boolean
}

async function getByContinue(
  continueId: string,
  continueToken: string,
  options: GetByContinueOpts = {}
): Promise<Grant | undefined> {
  const { includeRevoked = false } = options

  const queryBuilder = Grant.query()
    .findOne({ continueId, continueToken })
    .withGraphFetched('interaction')

  if (!includeRevoked) {
    queryBuilder.andWhere((queryBuilder) => {
      queryBuilder.whereNull('finalizationReason')
      queryBuilder.orWhereNot('finalizationReason', GrantFinalization.Revoked)
    })
  }

  const grant = await queryBuilder

  return grant
}

async function getGrantsPage(
  deps: ServiceDependencies,
  pagination?: Pagination,
  filter?: GrantFilter,
  sortOrder?: SortOrder,
  tenantId?: string
): Promise<Grant[]> {
  const query = Grant.query(deps.knex).withGraphJoined('access')
  const { identifier, state, finalizationReason } = filter ?? {}

  if (identifier?.in?.length) {
    query.whereIn('access.identifier', identifier.in)
  }

  if (state?.in?.length) {
    query.whereIn('state', state.in)
  }

  if (state?.notIn?.length) {
    query.whereNotIn('state', state.notIn)
  }

  if (finalizationReason?.in?.length) {
    query.whereIn('finalizationReason', finalizationReason.in)
  }

  if (finalizationReason?.notIn?.length) {
    query
      .whereNull('finalizationReason')
      .orWhereNotIn('finalizationReason', finalizationReason.notIn)
  }

  if (tenantId) {
    query.where('tenantId', tenantId)
  }

  return query.getPage(pagination, sortOrder)
}

async function updateLastContinuedAt(id: string): Promise<Grant> {
  return Grant.query().patchAndFetchById(id, {
    lastContinuedAt: new Date()
  })
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
