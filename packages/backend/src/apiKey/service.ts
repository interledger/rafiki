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
  redeem(accountId: string, key: string): Promise<SessionKey>
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
    redeem: (accountId, key) => redeemSessionKey(deps, accountId, key)
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
