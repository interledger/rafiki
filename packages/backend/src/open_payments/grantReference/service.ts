import { Transaction, TransactionOrKnex } from 'objection'
import { GrantReference } from './model'

export interface GrantReferenceService {
  get(grantId: string, trx?: Transaction): Promise<GrantReference>
  create(
    options: CreateGrantReferenceOptions,
    trx?: Transaction
  ): Promise<GrantReference>
  lock(grantId: string, trx: TransactionOrKnex): Promise<void>
}

export async function createGrantReferenceService(): Promise<GrantReferenceService> {
  return {
    get: (grantId, trx) => getGrantReference(grantId, trx),
    create: (options, trx) => createGrantReference(options, trx),
    lock: (grantId, trx) => lockGrantReference(grantId, trx)
  }
}

async function getGrantReference(grantId: string, trx: Transaction) {
  return await GrantReference.query(trx).findById(grantId)
}

interface CreateGrantReferenceOptions {
  id: string
  clientId: string
}

async function createGrantReference(
  options: CreateGrantReferenceOptions,
  trx: Transaction
) {
  return await GrantReference.query(trx).insertAndFetch(options)
}

async function lockGrantReference(grantId: string, trx: TransactionOrKnex) {
  // TODO: update to use objection once it supports forNoKeyUpdate
  await trx<GrantReference>('grantReferences')
    .select()
    .where('id', grantId)
    .forNoKeyUpdate()
    .timeout(5000)
}
