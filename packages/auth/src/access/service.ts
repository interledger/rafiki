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
  getByGrant(grantId: string, trx?: Transaction): Promise<Access[]>
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
    ) => createAccess(deps, grantId, accessRequests, trx),
    getByGrant: (grantId: string, trx?: Transaction) =>
      getByGrant(deps, grantId, trx)
  }
}

async function createAccess(
  deps: ServiceDependencies,
  grantId: string,
  accessRequests: AccessRequest[],
  trx?: Transaction
): Promise<Access[]> {
  const accessRequestsWithGrant = accessRequests.map((access) => {
    return { grantId, ...access }
  })

  return Access.query(trx || deps.knex).insert(accessRequestsWithGrant)
}

async function getByGrant(
  deps: ServiceDependencies,
  grantId: string,
  trx?: Transaction
): Promise<Access[]> {
  return Access.query(trx || deps.knex).where({
    grantId
  })
}
