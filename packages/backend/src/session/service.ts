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
  sessionLength: number
}

type SessionOptions = {
  key: string
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
    revoke: (options: SessionOptions) => revokeSession(deps, options),
    refresh: (options: SessionOptions) => refreshSession(deps, options),
    get: (options: SessionOptions) => getSession(deps, options)
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
  { key }: SessionOptions
): Promise<void> {
  await deps.redis.del(key)
}

async function refreshSession(
  deps: ServiceDependencies,
  { key }: SessionOptions
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
  { key }: SessionOptions
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
