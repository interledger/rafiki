import { BaseService } from '../shared/baseService'
import { SessionKeyService } from '../sessionKey/service'
import { ApiKey } from './model'
import { uuid } from '../connector/core'
import bcrypt from 'bcrypt'
import { Transaction } from 'knex'
import { SessionKey } from '../sessionKey/util'
import { ApiKeyError } from './errors'

export interface ApiKeyService {
  create(apiKey: ApiKeyOptions, trx?: Transaction): Promise<NewApiKey>
  get(apiKey: ApiKeyOptions): Promise<ApiKey[]>
  redeem(sessionKey: SessionKeyOptions): Promise<SessionKey | ApiKeyError>
  deleteAll(apiKey: ApiKeyOptions, trx?: Transaction): Promise<void>
}

interface ServiceDependencies extends BaseService {
  sessionKeyService: SessionKeyService
}

type ApiKeyOptions = {
  accountId: string
}

type SessionKeyOptions = {
  accountId: string
  key: string
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
    create: (options, trx) => createApiKey(deps, options, trx),
    get: (options) => getApiKeys(deps, options),
    redeem: (options) => redeemSessionKey(deps, options),
    deleteAll: (options, trx) => deleteAllApiKeys(deps, options, trx)
  }
}

async function createApiKey(
  deps: ServiceDependencies,
  { accountId }: ApiKeyOptions,
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
  { accountId }: ApiKeyOptions
): Promise<ApiKey[]> {
  return await ApiKey.query().where('accountId', accountId)
}

async function redeemSessionKey(
  deps: ServiceDependencies,
  { accountId, key }: SessionKeyOptions
): Promise<SessionKey | ApiKeyError> {
  const keys = await ApiKey.query()
    .select('hashedKey')
    .where('accountId', accountId)
  if (keys && keys.length) {
    const match = await bcrypt.compare(key, keys[0].hashedKey)
    if (match) {
      return deps.sessionKeyService.create()
    }
  }
  return ApiKeyError.UnknownApiKey
}

async function deleteAllApiKeys(
  deps: ServiceDependencies,
  { accountId }: ApiKeyOptions,
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
