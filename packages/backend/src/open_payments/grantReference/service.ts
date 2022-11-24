import { Transaction, TransactionOrKnex } from 'objection'
import { AccessAction } from '../auth/grant'
import { GrantReference } from './model'

export interface GrantReferenceService {
  get(grantId: string, trx?: Transaction): Promise<GrantReference>
  create(
    options: CreateGrantReferenceOptions,
    trx?: Transaction
  ): Promise<GrantReference>
  lock(grantId: string, trx: TransactionOrKnex): Promise<void>
  getOrCreate(
    options: CreateGrantReferenceOptions,
    action: AccessAction
  ): Promise<GrantReference | undefined>
}

export async function createGrantReferenceService(): Promise<GrantReferenceService> {
  return {
    get: (grantId, trx) => getGrantReference(grantId, trx),
    create: (options, trx) => createGrantReference(options, trx),
    lock: (grantId, trx) => lockGrantReference(grantId, trx),
    getOrCreate: (options, action) => getOrCreateGrantReference(options, action)
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

async function getOrCreateGrantReference(
  options: CreateGrantReferenceOptions,
  action: AccessAction
) {
  await GrantReference.transaction(async (trx: Transaction) => {
    const grantRef = await getGrantReference(options.id, trx)
    if (grantRef) {
      if (grantRef.clientId !== options.clientId) {
        throw new Error(
          `clientID ${options.clientId} for grant ${options.id} does not match internal reference clientId ${grantRef.clientId}.`
        )
      }

      return grantRef
    } else if (action === AccessAction.Create) {
      // Grant and client ID's are only stored for create routes
      return await createGrantReference(options, trx)
    }
  })

  return undefined
}
