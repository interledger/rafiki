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
      expect(session).toHaveProperty('key')
      expect(session).toHaveProperty('expiresAt')
      const retrievedSession = await SessionKeyService.getSession(session.key)
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
      await SessionKeyService.revoke(session.key)
      const revokedSession = SessionKeyService.getSession(session.key)
      expect(revokedSession).rejects.toThrow(
        new UnknownSessionError(session.key)
      )
    })

    test('Can refresh a session', async (): Promise<void> => {
      const session = await SessionKeyService.create()
      const renewedSession = await SessionKeyService.refresh(session.key)
      expect(session.key).not.toEqual(renewedSession.key)
      expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
        renewedSession.expiresAt.getTime()
      )
    })

    test('Cannot renew non-existing session', async (): Promise<void> => {
      const renewedSession = SessionKeyService.refresh('123')
      expect(renewedSession).rejects.toThrow(new UnknownSessionError('123'))
    })
  })
})
