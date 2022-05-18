import { Transaction, TransactionOrKnex } from 'objection'

import { BaseService } from '../shared/baseService'
import { Limit } from './model'
import { LimitData } from './types'

export interface LimitService {
  createLimit(
    grantId: string,
    limitData: LimitData,
    trx?: Transaction
  ): Promise<Limit>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createLimitService({
  logger,
  knex
}: ServiceDependencies): Promise<LimitService> {
  const log = logger.child({
    service: 'LimitService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex
  }

  return {
    createLimit: (grantId: string, limitData: LimitData, trx?: Transaction) =>
      createLimit(deps, grantId, limitData, trx)
  }
}

async function createLimit(
  deps: ServiceDependencies,
  grantId: string,
  limitData: LimitData,
  trx?: Transaction
): Promise<Limit> {
  const { description, externalRef, ...restOfLimitData } = limitData
  return Limit.query(trx || deps.knex).insert({
    grantId,
    data: restOfLimitData,
    description,
    externalRef
  })
}
