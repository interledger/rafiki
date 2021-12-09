import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { SessionService } from './service'
import { initIocContainer } from '..'
import { Redis } from 'ioredis'
import { Config } from '../config/app'

describe('Session Key Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let sessionService: SessionService
  let redis: Redis

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      sessionService = await deps.use('sessionService')
      redis = await deps.use('redis')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      jest.useFakeTimers('modern')
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.useRealTimers()
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
      const session = await sessionService.create()
      expect(session).toHaveProperty('key')
      expect(session).toHaveProperty('expiresAt')
      const retrievedSession = await sessionService.get({
        key: session.key
      })
      if (retrievedSession) {
        expect(retrievedSession).toEqual(session)
      } else {
        fail()
      }
    })

    test('Cannot fetch non-existing session', async (): Promise<void> => {
      const session = sessionService.get({ key: '123' })
      expect(session).resolves.toBeUndefined()
    })

    test('Session expires', async (): Promise<void> => {
      const session = await sessionService.create()
      const ttl = await redis.pttl(session.key)
      expect(ttl).toBeGreaterThan(0)
    })
  })

  describe('Manage Session', (): void => {
    test('Can revoke a session', async (): Promise<void> => {
      const session = await sessionService.create()
      await sessionService.revoke({ key: session.key })
      const revokedSession = sessionService.get({
        key: session.key
      })
      expect(revokedSession).resolves.toBeUndefined()
    })

    test('Can refresh a session', async (): Promise<void> => {
      const session = await sessionService.create()
      jest.setSystemTime(new Date(Date.now() + 60 * 1000))
      const refreshedSession = await sessionService.refresh({
        key: session.key
      })
      if (!refreshedSession) {
        fail()
      } else {
        expect(session.key).toEqual(refreshedSession.key)
        expect(refreshedSession.expiresAt.getTime()).toBeGreaterThan(
          session.expiresAt.getTime()
        )
      }
    })

    test('Cannot refresh non-existing session', async (): Promise<void> => {
      const refreshSession = sessionService.refresh({ key: '123' })
      expect(refreshSession).resolves.toBeUndefined()
    })
  })
})
