import { BaseService } from '../shared/baseService'
import { uuid } from '../connector/core'
import Redis from 'ioredis'
import { Session } from './util'

export interface SessionService {
  create(): Promise<Session>
  revoke(key: string): void
  refresh(key: string): Promise<Session | undefined>
  get(key: string): Promise<Session | undefined>
}

interface ServiceDependencies extends BaseService {
  redis: Redis
  sessionLength: number
}

export async function createSessionService({
  logger,
  redis,
  sessionLength
}: ServiceDependencies): Promise<SessionService> {
  const log = logger.child({
    service: 'SessionService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    redis,
    sessionLength
  }
  return {
    create: () => createSession(deps),
    revoke: (key: string) => revokeSession(deps, key),
    refresh: (key: string) => refreshSession(deps, key),
    get: (key: string) => getSession(deps, key)
  }
}

async function createSession(deps: ServiceDependencies): Promise<Session> {
  const key = uuid()
  const expiry = Date.now() + deps.sessionLength * 60 * 1000
  await deps.redis.set(key, expiry, 'PXAT', expiry)
  return {
    key,
    expiresAt: new Date(expiry)
  }
}

async function revokeSession(
  deps: ServiceDependencies,
  key: string
): Promise<void> {
  await deps.redis.del(key)
}

async function refreshSession(
  deps: ServiceDependencies,
  key: string
): Promise<Session | undefined> {
  const session = await deps.redis.get(key)
  if (session) {
    const expiry = Date.now() + deps.sessionLength * 60 * 1000
    await deps.redis.set(key, expiry, 'PXAT', expiry)
    return {
      key,
      expiresAt: new Date(expiry)
    }
  } else {
    return undefined
  }
}

async function getSession(
  deps: ServiceDependencies,
  key: string
): Promise<Session | undefined> {
  const expiry = await deps.redis.get(key)
  if (expiry) {
    return {
      key,
      expiresAt: new Date(Number(expiry))
    }
  } else {
    return undefined
  }
}
