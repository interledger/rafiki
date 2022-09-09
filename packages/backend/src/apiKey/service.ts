import bcrypt from 'bcrypt'
import { v4 as uuid } from 'uuid'

import { BaseService } from '../shared/baseService'
import { SessionService } from '../session/service'
import { ApiKey } from './model'
import { Session } from '../session/util'
import { ApiKeyError } from './errors'

export interface ApiKeyService {
  create(apiKey: ApiKeyOptions): Promise<NewApiKey>
  get(apiKey: ApiKeyOptions): Promise<ApiKey[]>
  redeem(session: SessionOptions): Promise<Session | ApiKeyError>
  deleteAll(apiKey: ApiKeyOptions): Promise<void>
}

interface ServiceDependencies extends BaseService {
  sessionService: SessionService
}

type ApiKeyOptions = {
  paymentPointerId: string
}

type SessionOptions = {
  paymentPointerId: string
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
  { paymentPointerId }: ApiKeyOptions
): Promise<NewApiKey> {
  const key = uuid()
  const hashedKey = await bcrypt.hash(key, 10)
  const keyEntry = await ApiKey.query(deps.knex).insertAndFetch({
    paymentPointerId,
    hashedKey
  })
  const newKey = <NewApiKey>keyEntry
  newKey.key = key
  return newKey
}

async function getApiKeys(
  deps: ServiceDependencies,
  { paymentPointerId }: ApiKeyOptions
): Promise<ApiKey[]> {
  return await ApiKey.query().where('paymentPointerId', paymentPointerId)
}

async function redeemApiKey(
  deps: ServiceDependencies,
  { paymentPointerId, key }: SessionOptions
): Promise<Session | ApiKeyError> {
  const keys = await ApiKey.query()
    .select('hashedKey')
    .where('paymentPointerId', paymentPointerId)
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
  { paymentPointerId }: ApiKeyOptions
): Promise<void> {
  await ApiKey.query(deps.knex)
    .delete()
    .where('paymentPointerId', paymentPointerId)
}
