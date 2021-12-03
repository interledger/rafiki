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
      const session = await sessionService.create()
      expect(session).toHaveProperty('key')
      expect(session).toHaveProperty('expiresAt')
      const retrievedSession = await sessionService.get({
        key: session.key
      })
      if (retrievedSession) {
        expect(retrievedSession.key).toEqual(session.key)
        expect(
          retrievedSession.expiresAt.getTime() - session.expiresAt.getTime()
        ).toBeLessThanOrEqual(1)
        expect(
          retrievedSession.expiresAt.getTime() - session.expiresAt.getTime()
        ).toBeGreaterThanOrEqual(-1)
      } else {
        fail()
      }
    })

    test('Cannot fetch non-existing session', async (): Promise<void> => {
      const sessionOrError = sessionService.get({ key: '123' })
      expect(sessionOrError).resolves.toBeUndefined()
    })
  })

  describe('Manage Session', (): void => {
    test('Can revoke a session', async (): Promise<void> => {
      const session = await sessionService.create()
      await sessionService.revoke({ key: session.key })
      const revokedSessionOrError = sessionService.get({
        key: session.key
      })
      expect(revokedSessionOrError).resolves.toBeUndefined()
    })

    test('Can refresh a session', async (): Promise<void> => {
      const session = await sessionService.create()
      const refreshedSession = await sessionService.refresh({
        key: session.key
      })
      if (!refreshedSession) {
        fail()
      } else {
        expect(session.key).toEqual(refreshedSession.key)
        expect(
          session.expiresAt.getTime() - refreshedSession.expiresAt.getTime()
        ).toBeLessThanOrEqual(1)
        expect(
          session.expiresAt.getTime() - refreshedSession.expiresAt.getTime()
        ).toBeGreaterThanOrEqual(-1)
      }
    })

    test('Cannot refresh non-existing session', async (): Promise<void> => {
      const refreshSessionOrError = sessionService.refresh({ key: '123' })
      expect(refreshSessionOrError).resolves.toBeUndefined()
    })
  })
})
