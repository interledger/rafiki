import { TransactionOrKnex } from 'objection'
import { BaseService } from '../../shared/baseService'
import { GrantReference } from './model'

export interface GrantReferenceService {
  get(grantId: string): Promise<GrantReference>
  create(options: CreateGrantReferenceOptions): Promise<GrantReference>
  lock(trx: TransactionOrKnex, grantId: string): Promise<void>
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
    get: (grantId) => getGrantReference(deps, grantId),
    create: (options) => createGrantReference(deps, options),
    lock: (trx, grantId) => lockGrantReference(trx, grantId)
  }
}

async function getGrantReference(deps: BaseService, grantId: string) {
  return await GrantReference.query(deps.knex).findById(grantId)
}

interface CreateGrantReferenceOptions {
  id: string
  clientId: string
}

async function createGrantReference(
  deps: BaseService,
  options: CreateGrantReferenceOptions
) {
  return await GrantReference.query(deps.knex).insertAndFetch(options)
}

async function lockGrantReference(trx: TransactionOrKnex, grantId: string) {
  // TODO: update to use objection once it supports forNoKeyUpdate
  await trx<GrantReference>('grantReferences')
    .select()
    .where('id', grantId)
    .forNoKeyUpdate()
    .timeout(5000)
}
