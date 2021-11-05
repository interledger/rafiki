import { BaseService } from '../shared/baseService'
import { uuid } from '../connector/core'
import IORedis from 'ioredis'
import { isSessionKeyError, SessionKeyError } from './errors'
import { Session, SessionKey } from './util'

export interface SessionKeyService {
  create(): Promise<SessionKey>
  revoke(sessionKey: string): void
  refresh(sessionKey: string): Promise<SessionKey | SessionKeyError>
  getSession(sessionKey: string): Promise<Session | SessionKeyError>
}

interface ServiceDependencies extends BaseService {
  redis: IORedis.Redis
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
    refresh: (sessionKey: string) => refreshSessionKey(deps, sessionKey),
    getSession: (sessionKey: string) => getSession(deps, sessionKey)
  }
}

async function createSessionKey(
  deps: ServiceDependencies
): Promise<SessionKey> {
  const sessionKey = uuid()
  const expiresAt = Date.now() + 30 * 60 * 1000 // 30 minutes
  await deps.redis.set(sessionKey, JSON.stringify({ expiresAt }), 'EX', 30 * 60)
  return { key: sessionKey, expiresAt: new Date(expiresAt) }
}

async function revokeSessionKey(deps: ServiceDependencies, sessionKey: string) {
  deps.redis.del(sessionKey)
}

async function refreshSessionKey(
  deps: ServiceDependencies,
  sessionKey: string
): Promise<SessionKey | SessionKeyError> {
  const sessionOrError = await getSession(deps, sessionKey)
  if (isSessionKeyError(sessionOrError)) {
    return sessionOrError
  } else {
    if (sessionOrError.expiresAt > new Date(Date.now())) {
      return createSessionKey(deps)
    } else {
      return SessionKeyError.SessionExpired
    }
  }
}

async function getSession(
  deps: ServiceDependencies,
  sessionKey: string
): Promise<Session | SessionKeyError> {
  const retrievedSession = await deps.redis.get(sessionKey)
  if (retrievedSession) {
    const session = JSON.parse(retrievedSession)
    session.expiresAt = new Date(session.expiresAt)
    return session
  } else {
    return SessionKeyError.UnknownSession
  }
}
