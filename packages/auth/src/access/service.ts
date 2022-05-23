import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Access } from './model'
import { AccessRequest } from './types'

export interface AccessService {
  createAccess(
    grantId: string,
    accessRequest: AccessRequest,
    trx?: Transaction
  ): Promise<Access>
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
      accessRequest: AccessRequest,
      trx?: Transaction
    ) => createAccess(deps, grantId, accessRequest, trx)
  }
}

async function createAccess(
  deps: ServiceDependencies,
  grantId: string,
  accessRequest: AccessRequest,
  trx?: Transaction
): Promise<Access> {
  return Access.query(trx || deps.knex).insert({
    grantId,
    ...accessRequest
  })
}
