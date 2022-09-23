import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Access } from './model'
import { AccessRequest } from './types'

export interface AccessService {
  createAccess(
    grantId: string,
    accessRequests: AccessRequest[],
    trx?: Transaction
  ): Promise<Access[]>
  createAccessForResourceSet(
    resourceId: string,
    accessRequests: AccessRequest[],
    trx?: Transaction
  ): Promise<Access[]>
  getByGrant(grantId: string): Promise<Access[]>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createAccessService({
  logger,
  knex
}: ServiceDependencies): Promise<AccessService> {
  const log = logger.child({
    service: 'AccessService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex
  }

  return {
    createAccess: (
      grantId: string,
      accessRequests: AccessRequest[],
      trx?: Transaction
    ) => createAccess(deps, { accessRequests, grantId } as GrantAccess, trx),
    createAccessForResourceSet: (
      resourceId: string,
      accessRequests: AccessRequest[],
      trx?: Transaction
    ) =>
      createAccess(deps, { accessRequests, resourceId } as ResourceAccess, trx),
    getByGrant: (grantId: string) => getByGrant(grantId)
  }
}

interface GrantAccess {
  accessRequests: AccessRequest[]
  grantId: string
  resourceId: never
}

interface ResourceAccess {
  accessRequests: AccessRequest[]
  grantId: never
  resourceId: string
}

type AccessOptions = GrantAccess | ResourceAccess

async function createAccess(
  deps: ServiceDependencies,
  { accessRequests, grantId, resourceId }: AccessOptions,
  trx?: Transaction
): Promise<Access[]> {
  const accessRequestsWithGrantOrResource = accessRequests.map((access) => {
    return { grantId, resourceId, ...access }
  })

  return Access.query(trx || deps.knex).insert(
    accessRequestsWithGrantOrResource
  )
}

async function getByGrant(grantId: string): Promise<Access[]> {
  return Access.query().where({
    grantId
  })
}
