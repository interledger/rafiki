import { BaseService } from '../shared/baseService'
import { SessionKeyService } from '../sessionKey/service'
import { ApiKey } from './model'
import { uuid } from '../connector/core'
import bcrypt from 'bcrypt'
import { Transaction } from 'knex'
import { SessionKey } from '../sessionKey/util'
import { NoExistingApiKeyError, UnknownApiKeyError } from './errors'

export interface ApiKeyService {
  create(accountId: string, trx?: Transaction): Promise<NewApiKey>
  get(accountId: string): Promise<ApiKey[]>
  redeem(accountId: string, key: string): Promise<SessionKey>
  deleteAll(accountId: string, trx?: Transaction): Promise<void>
}

interface ServiceDependencies extends BaseService {
  sessionKeyService: SessionKeyService
}

interface NewApiKey extends ApiKey {
  key: string
}

export async function createApiKeyService({
  logger,
  knex,
  sessionKeyService
}: ServiceDependencies): Promise<ApiKeyService> {
  const log = logger.child({
    service: 'ApiKeyService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    sessionKeyService
  }
  return {
    create: (accountId, trx) => createApiKey(deps, accountId, trx),
    get: (accountId) => getApiKeys(deps, accountId),
    redeem: (accountId, key) => redeemSessionKey(deps, accountId, key),
    deleteAll: (accountId, trx) => deleteAllApiKeys(deps, accountId, trx)
  }
}

async function createApiKey(
  deps: ServiceDependencies,
  accountId: string,
  trx?: Transaction
): Promise<NewApiKey> {
  const keyTrx = trx || (await ApiKey.startTransaction(deps.knex))
  const key = uuid()
  try {
    const hashedKey = await bcrypt.hash(key, 10)
    const keyEntry = await ApiKey.query(keyTrx).insertAndFetch({
      accountId,
      hashedKey
    })
    await keyTrx.commit()
    const newKey = <NewApiKey>keyEntry
    newKey.key = key
    return newKey
  } catch (err) {
    await keyTrx.rollback()
    throw err
  }
}

async function getApiKeys(
  deps: ServiceDependencies,
  accountId: string
): Promise<ApiKey[]> {
  return await ApiKey.query().where('accountId', accountId)
}

async function redeemSessionKey(
  deps: ServiceDependencies,
  accountId: string,
  key: string
): Promise<SessionKey> {
  const keys = await ApiKey.query()
    .select('hashedKey')
    .where('accountId', accountId)
  if (keys && !keys.length) {
    throw new NoExistingApiKeyError(accountId)
  } else {
    const match = await bcrypt.compare(key, keys[0].hashedKey)
    if (match) {
      return deps.sessionKeyService.create()
    } else {
      throw new UnknownApiKeyError(accountId)
    }
  }
}

async function deleteAllApiKeys(
  deps: ServiceDependencies,
  accountId: string,
  trx?: Transaction
): Promise<void> {
  const keyTrx = trx || (await ApiKey.startTransaction(deps.knex))
  try {
    await ApiKey.query(keyTrx).delete().where('accountId', accountId)
    await keyTrx.commit()
  } catch (err) {
    await keyTrx.rollback()
    throw err
  }
}
