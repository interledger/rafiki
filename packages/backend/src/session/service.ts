import { BaseService } from '../shared/baseService'
import { uuid } from '../connector/core'
import IORedis from 'ioredis'
import { Session } from './util'

export interface SessionService {
  create(): Promise<Session>
  revoke(session: SessionOptions): void
  refresh(session: SessionOptions): Promise<Session | undefined>
  get(session: SessionOptions): Promise<Session | undefined>
}

interface ServiceDependencies extends BaseService {
  redis: IORedis.Redis
}

type SessionOptions = {
  key: string
}

export async function createSessionService({
  logger,
  redis
}: ServiceDependencies): Promise<SessionService> {
  const log = logger.child({
    service: 'SessionService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    redis
  }
  return {
    create: () => createSession(deps),
    revoke: (options: SessionOptions) => revokeSession(deps, options),
    refresh: (options: SessionOptions) => refreshSession(deps, options),
    get: (options: SessionOptions) => getSession(deps, options)
  }
}

async function createSession(deps: ServiceDependencies): Promise<Session> {
  const key = uuid()
  await deps.redis.set(key, 0, 'EX', 30 * 60)
  const sessionExpiry = await deps.redis.pttl(key)
  return {
    key,
    expiresAt: new Date(Date.now() + sessionExpiry)
  }
}

async function revokeSession(
  deps: ServiceDependencies,
  { key }: SessionOptions
): Promise<void> {
  await deps.redis.del(key)
}

async function refreshSession(
  deps: ServiceDependencies,
  { key }: SessionOptions
): Promise<Session | undefined> {
  await deps.redis.expire(key, 30 * 60)
  return getSession(deps, { key })
}

async function getSession(
  deps: ServiceDependencies,
  { key }: SessionOptions
): Promise<Session | undefined> {
  const sessionExpiry = await deps.redis.pttl(key)
  if (sessionExpiry > 0) {
    return {
      key,
      expiresAt: new Date(Date.now() + sessionExpiry)
    }
  } else {
    return undefined
  }
}
