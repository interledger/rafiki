import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { createTestApp, TestContainer } from '../tests/app'
import { SessionKeyService } from './service'
import { initIocContainer } from '../'
import { Redis } from 'ioredis'
import { Config } from '../config/app'
import { isSessionKeyError, SessionKeyError } from './errors'

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
      const retrievedSession = await SessionKeyService.getSession({
        key: session.key
      })
      expect(retrievedSession).toEqual({ expiresAt: session.expiresAt })
    })

    test('Cannot fetch non-existing session', async (): Promise<void> => {
      const sessionOrError = SessionKeyService.getSession({ key: '123' })
      expect(sessionOrError).resolves.toEqual(SessionKeyError.UnknownSession)
    })
  })

  describe('Manage Session', (): void => {
    test('Can revoke a session', async (): Promise<void> => {
      const session = await SessionKeyService.create()
      await SessionKeyService.revoke({ key: session.key })
      const revokedSessionOrError = SessionKeyService.getSession({
        key: session.key
      })
      expect(revokedSessionOrError).resolves.toEqual(
        SessionKeyError.UnknownSession
      )
    })

    test('Can refresh a session', async (): Promise<void> => {
      const session = await SessionKeyService.create()
      const refreshSessionOrError = await SessionKeyService.refresh({
        key: session.key
      })
      if (isSessionKeyError(refreshSessionOrError)) {
        fail()
      } else {
        expect(session.key).not.toEqual(refreshSessionOrError.key)
        expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
          refreshSessionOrError.expiresAt.getTime()
        )
      }
    })

    test('Cannot refresh non-existing session', async (): Promise<void> => {
      const refreshSessionOrError = SessionKeyService.refresh({ key: '123' })
      expect(refreshSessionOrError).resolves.toEqual(
        SessionKeyError.UnknownSession
      )
    })
  })
})
