import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { SessionKeyService } from './service'
import { initIocContainer } from '../'
import { Redis } from 'ioredis'
import { Config } from '../config/app'
import { UnknownSessionError } from './errors'

describe('Session Key Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let SessionKeyService: SessionKeyService
  let redis: Redis

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      SessionKeyService = await deps.use('sessionKeyService')
      redis = await deps.use('redis')
    }
  )

  afterEach(
    async (): Promise<void> => {
      await redis.flushdb()
    }
  )

  afterAll(
    async (): Promise<void> => {
      await redis.disconnect()
      await appContainer.shutdown()
    }
  )

  describe('Create / Get Session', (): void => {
    test('Can create and fetch session', async (): Promise<void> => {
      const session = await SessionKeyService.create()
      expect(session).toHaveProperty('sessionKey')
      expect(session).toHaveProperty('expiresAt')
      const retrievedSession = await SessionKeyService.getSession(
        session.sessionKey
      )
      expect(retrievedSession).toEqual({ expiresAt: session.expiresAt })
    })

    test('Cannot fetch non-existing session', async (): Promise<void> => {
      const session = SessionKeyService.getSession('123')
      expect(session).rejects.toThrow(new UnknownSessionError('123'))
    })
  })

  describe('Manage Session', (): void => {
    test('Can revoke a session', async (): Promise<void> => {
      const session = await SessionKeyService.create()
      await SessionKeyService.revoke(session.sessionKey)
      const revokedSession = SessionKeyService.getSession(session.sessionKey)
      expect(revokedSession).rejects.toThrow(
        new UnknownSessionError(session.sessionKey)
      )
    })

    test('Can renew a session', async (): Promise<void> => {
      const session = await SessionKeyService.create()
      const renewedSession = await SessionKeyService.renew(session.sessionKey)
      expect(session.sessionKey).not.toEqual(renewedSession.sessionKey)
      expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
        renewedSession.expiresAt.getTime()
      )
    })

    test('Cannot renew non-existing session', async (): Promise<void> => {
      const renewedSession = SessionKeyService.renew('123')
      expect(renewedSession).rejects.toThrow(new UnknownSessionError('123'))
    })
  })
})
