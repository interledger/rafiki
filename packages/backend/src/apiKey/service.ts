import { BaseService } from '../shared/baseService'
import { SessionKeyService } from '../sessionKey/service'
import { ApiKey } from './model'
import { uuid } from '../connector/core'
import { bcrypt } from 'bcrypt'
import { Transaction } from 'knex'
import { SessionKey } from '../sessionKey/model'
import { UnknownApiKeyError } from './errors'

export interface ApiKeyService {
  create(accountId: string, trx?: Transaction): Promise<ApiKey>
  redeem(accountId: string, key: string): Promise<SessionKey>
}

interface ServiceDependencies extends BaseService {
  sessionKeyService: SessionKeyService
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
): Promise<ApiKey> {
  const keyTrx = trx || (await ApiKey.startTransaction(deps.knex))
  const key = uuid()
  try {
    const hashedKey = await bcrypt.hash(key, 10)
    const keyEntry = await ApiKey.query(keyTrx).insertAndFetch({
      accountId,
      hashedKey
    })
    await keyTrx.commit()
    keyEntry.key = key
    return keyEntry
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
  const hashedKey = await ApiKey.query()
    .select('hashedKey')
    .where('accountId', accountId)
  const match = await bcrypt.compare(key, hashedKey)
  if (match) {
    return deps.sessionKeyService.create()
  } else {
    throw new UnknownApiKeyError(accountId)
  }
}
