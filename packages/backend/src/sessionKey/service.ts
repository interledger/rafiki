import { BaseService } from '../shared/baseService'
import { uuid } from '../connector/core'
import IORedis from 'ioredis'
import { SessionKeyExpiredError } from './errors'

export interface SessionKeyService {
  create(): Promise<SessionKey>
  revoke(sessionKey: string): void
  renew(sessionKey: string): Promise<SessionKey>
}

interface ServiceDependencies extends BaseService {
  redis: IORedis.Redis
}

interface SessionKey {
  sessionKey: string
  expiresAt: Date
}

export async function createSessionKeyService({
  logger,
  redis
}: ServiceDependencies): Promise<SessionKeyService> {
  const log = logger.child({
    service: 'SessionKeyService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    redis
  }
  return {
    create: () => createSessionKey(deps),
    revoke: (sessionKey: string) => revokeSessionKey(deps, sessionKey),
    renew: (sessionKey: string) => renewSessionKey(deps, sessionKey)
  }
}

async function createSessionKey(
  deps: ServiceDependencies
): Promise<SessionKey> {
  const sessionKey = uuid()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
  await deps.redis.set(sessionKey, expiresAt, 'EX', 30 * 60)
  return { sessionKey, expiresAt }
}

async function revokeSessionKey(deps: ServiceDependencies, sessionKey: string) {
  deps.redis.del(sessionKey)
}

async function renewSessionKey(
  deps: ServiceDependencies,
  sessionKey: string
): Promise<SessionKey> {
  const session = await deps.redis.get(sessionKey)
  if (session.expiresAt > new Date(Date.now())) {
    return createSessionKey(deps)
  } else {
    throw new SessionKeyExpiredError()
  }
}
