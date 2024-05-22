import { IocContract } from '@adonisjs/fold'
import { Redis } from 'ioredis'

import { AppContext, AppServices } from '../app'
import { Config } from '../config/app'
import { createContext } from '../tests/context'
import { generateApiSignature } from '../tests/apiSignature'
import { initIocContainer } from '..'
import { verifyApiSignature } from './utils'
import { TestContainer, createTestApp } from '../tests/app'

describe('utils', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let redis: Redis

  describe('admin api signatures', (): void => {
    beforeAll(async (): Promise<void> => {
      deps = initIocContainer({
        ...Config,
        adminApiSecret: 'test-secret'
      })
      appContainer = await createTestApp(deps)
      redis = await deps.use('redis')
    })

    afterAll(async (): Promise<void> => {
      await redis.quit()
      await appContainer.shutdown()
    })

    test('Can verify a signature', async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const signature = generateApiSignature(
        'test-secret',
        Config.adminApiSignatureVersion,
        requestBody
      )
      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json',
            signature
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      )
      ctx.request.body = requestBody

      const verified = await verifyApiSignature(ctx, {
        ...Config,
        adminApiSecret: 'test-secret'
      })
      expect(verified).toBe(true)
    })

    test('verification fails if header is not present', async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json'
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      )
      ctx.request.body = requestBody

      const verified = await verifyApiSignature(ctx, {
        ...Config,
        adminApiSecret: 'test-secret'
      })
      expect(verified).toBe(false)
    })

    test('Cannot verify signature that has already been processed', async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const signature = generateApiSignature(
        'test-secret',
        Config.adminApiSignatureVersion,
        requestBody
      )
      const key = `signature:${signature}`
      const op = redis.multi()
      op.set(key, signature)
      op.expire(key, signature)
      await op.exec()
      const ctx = createContext<AppContext>(
        {
          headers: {
            Accept: 'application/json',
            signature
          },
          url: '/graphql'
        },
        {},
        appContainer.container
      )
      ctx.request.body = requestBody

      const verified = await verifyApiSignature(ctx, {
        ...Config,
        adminApiSecret: 'test-secret'
      })
      expect(verified).toBe(false)
    })
  })
})
