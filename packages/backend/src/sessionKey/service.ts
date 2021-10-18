import { BaseService } from '../shared/baseService'
import { uuid } from '../connector/core'
import IORedis from 'ioredis'

export interface SessionKeyService {
  create(): Promise<SessionKey>
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
    create: () => createSessionKey(deps)
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
