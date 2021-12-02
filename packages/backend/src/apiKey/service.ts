import { BaseService } from '../shared/baseService'
import { SessionService } from '../session/service'
import { ApiKey } from './model'
import { uuid } from '../connector/core'
import bcrypt from 'bcrypt'
import { SessionKey } from '../session/util'
import { ApiKeyError } from './errors'

export interface ApiKeyService {
  create(apiKey: ApiKeyOptions): Promise<NewApiKey>
  get(apiKey: ApiKeyOptions): Promise<ApiKey[]>
  redeem(sessionKey: SessionKeyOptions): Promise<SessionKey | ApiKeyError>
  deleteAll(apiKey: ApiKeyOptions): Promise<void>
}

interface ServiceDependencies extends BaseService {
  sessionService: SessionService
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
  sessionService: sessionKeyService
}: ServiceDependencies): Promise<ApiKeyService> {
  const log = logger.child({
    service: 'ApiKeyService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    sessionService: sessionKeyService
  }
  return {
    create: (options) => createApiKey(deps, options),
    get: (options) => getApiKeys(deps, options),
    redeem: (options) => redeemApiKey(deps, options),
    deleteAll: (options) => deleteAllApiKeys(deps, options)
  }
}

async function createApiKey(
  deps: ServiceDependencies,
  { accountId }: ApiKeyOptions
): Promise<NewApiKey> {
  const key = uuid()
  const hashedKey = await bcrypt.hash(key, 10)
  const keyEntry = await ApiKey.query(deps.knex).insertAndFetch({
    accountId,
    hashedKey
  })
  const newKey = <NewApiKey>keyEntry
  newKey.key = key
  return newKey
}

async function getApiKeys(
  deps: ServiceDependencies,
  { accountId }: ApiKeyOptions
): Promise<ApiKey[]> {
  return await ApiKey.query().where('accountId', accountId)
}

async function redeemApiKey(
  deps: ServiceDependencies,
  { accountId, key }: SessionKeyOptions
): Promise<SessionKey | ApiKeyError> {
  const keys = await ApiKey.query()
    .select('hashedKey')
    .where('accountId', accountId)
  for (const { hashedKey } of keys) {
    const match = await bcrypt.compare(key, hashedKey)
    if (match) {
      return deps.sessionService.create()
    }
  }
  return ApiKeyError.UnknownApiKey
}

async function deleteAllApiKeys(
  deps: ServiceDependencies,
  { accountId }: ApiKeyOptions
): Promise<void> {
  await ApiKey.query(deps.knex).delete().where('accountId', accountId)
}
