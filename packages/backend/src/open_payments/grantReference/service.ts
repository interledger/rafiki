import { Transaction, TransactionOrKnex } from 'objection'
import { BaseService } from '../../shared/baseService'
import { GrantReference } from './model'

export interface GrantReferenceService {
  get(grantId: string, trx?: Transaction): Promise<GrantReference>
  create(
    options: CreateGrantReferenceOptions,
    trx?: Transaction
  ): Promise<GrantReference>
  lock(grantId: string, trx?: TransactionOrKnex): Promise<void>
}

export async function createGrantReferenceService(
  deps_: BaseService
): Promise<GrantReferenceService> {
  const log = deps_.logger.child({
    service: 'GrantReferenceService'
  })
  const deps: BaseService = {
    ...deps_,
    logger: log
  }
  return {
    get: (grantId, trx) => getGrantReference(deps, grantId, trx),
    create: (options, trx) => createGrantReference(deps, options, trx),
    lock: (grantId, trx) => lockGrantReference(deps, grantId, trx)
  }
}

async function getGrantReference(
  deps: BaseService,
  grantId: string,
  trx?: Transaction
) {
  return await GrantReference.query(trx || deps.knex).findById(grantId)
}

interface CreateGrantReferenceOptions {
  id: string
  clientId: string
}

async function createGrantReference(
  deps: BaseService,
  options: CreateGrantReferenceOptions,
  trx?: Transaction
) {
  return await GrantReference.query(trx || deps.knex).insertAndFetch(options)
}

async function lockGrantReference(
  deps: BaseService,
  grantId: string,
  trx?: TransactionOrKnex
) {
  const transaction = trx || deps.knex
  // TODO: update to use objection once it supports forNoKeyUpdate
  await transaction<GrantReference>('grantReferences')
    .select()
    .where('id', grantId)
    .forNoKeyUpdate()
    .timeout(5000)
}
