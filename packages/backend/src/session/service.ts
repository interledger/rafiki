import { BaseService } from '../shared/baseService'
import { uuid } from '../connector/core'
import IORedis from 'ioredis'
import { isSessionError, SessionError } from './errors'
import { Session, SessionKey } from './util'

export interface SessionService {
  create(): Promise<SessionKey>
  revoke(session: SessionOptions): void
  refresh(session: SessionOptions): Promise<SessionKey | SessionError>
  get(session: SessionOptions): Promise<Session | SessionError>
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

async function createSession(deps: ServiceDependencies): Promise<SessionKey> {
  const sessionKey = uuid()
  const expiresAt = Date.now() + 30 * 60 * 1000 // 30 minutes
  await deps.redis.set(sessionKey, JSON.stringify({ expiresAt }), 'EX', 30 * 60)
  return { key: sessionKey, expiresAt: new Date(expiresAt) }
}

async function revokeSession(
  deps: ServiceDependencies,
  { key }: SessionOptions
) {
  deps.redis.del(key)
}

async function refreshSession(
  deps: ServiceDependencies,
  { key }: SessionOptions
): Promise<SessionKey | SessionError> {
  const sessionOrError = await getSession(deps, { key })
  if (isSessionError(sessionOrError)) {
    return sessionOrError
  } else {
    if (sessionOrError.expiresAt > new Date(Date.now())) {
      return createSession(deps)
    } else {
      return SessionError.SessionExpired
    }
  }
}

async function getSession(
  deps: ServiceDependencies,
  { key }: SessionOptions
): Promise<Session | SessionError> {
  const retrievedSession = await deps.redis.get(key)
  if (retrievedSession) {
    const session = JSON.parse(retrievedSession)
    session.expiresAt = new Date(session.expiresAt)
    return session
  } else {
    return SessionError.UnknownSession
  }
}
