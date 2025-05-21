import { IocContract } from '@adonisjs/fold'
import { Redis } from 'ioredis'

import { AppContext, AppServices } from '../app'
import { Config } from '../config/app'
import { createContext } from '../tests/context'
import { generateApiSignature } from '../tests/apiSignature'
import { initIocContainer } from '..'
import { verifyApiSignature, isValidDateString } from './utils'
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

    afterEach(async (): Promise<void> => {
      jest.useRealTimers()
      await redis.flushall()
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

    test('Cannot verify signature that is too old', async (): Promise<void> => {
      const requestBody = { test: 'value' }
      const signature = generateApiSignature(
        'test-secret',
        Config.adminApiSignatureVersion,
        requestBody
      )

      const timestamp = signature.split(', ')[0].split('=')[1]
      const now = new Date(
        Number(timestamp) + (Config.adminApiSignatureTtlSeconds + 1) * 1000
      )
      jest.useFakeTimers({ now })
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

    test('Cannot verify signature that has already been processed', async (): Promise<void> => {
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

      await expect(
        verifyApiSignature(ctx, {
          ...Config,
          adminApiSecret: 'test-secret'
        })
      ).resolves.toBe(true)

      const verified = await verifyApiSignature(ctx, {
        ...Config,
        adminApiSecret: 'test-secret'
      })
      expect(verified).toBe(false)
    })
  })

  describe('isValidDateString', () => {
    test.each([
      ['2024-12-05T15:10:09.545Z', true],
      ['2024-12-05', true],
      ['invalid-date', false], // Invalid date string
      ['2024-12-05T25:10:09.545Z', false], // Invalid date string (invalid hour)
      ['"2024-12-05T15:10:09.545Z"', false], // Improperly formatted string
      ['', false], // Empty string
      [null, false], // Null value
      [undefined, false] // Undefined value
    ])('should return %p for input %p', (input, expected) => {
      expect(isValidDateString(input!)).toBe(expected)
    })
  })
})
