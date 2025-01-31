import { IocContract } from '@adonisjs/fold'
import { Redis } from 'ioredis'
import { isValidHttpUrl, poll, requestWithTimeout, sleep } from './utils'
import { AppServices, AppContext } from '../app'
import { TestContainer, createTestApp } from '../tests/app'
import { initIocContainer } from '..'
import { verifyApiSignature } from './utils'
import { generateApiSignature } from '../tests/apiSignature'
import { Config } from '../config/app'
import { createContext } from '../tests/context'

describe('utils', (): void => {
  describe('isValidHttpUrl', (): void => {
    test.each`
      url                         | result   | type
      ${''}                       | ${false} | ${'invalid'}
      ${undefined}                | ${false} | ${'invalid'}
      ${{}}                       | ${false} | ${'invalid'}
      ${'mailto:john@doe.com'}    | ${false} | ${'invalid'}
      ${'ftp://0.0.0.0@0.0.0.0'}  | ${false} | ${'invalid'}
      ${'javascript:void(0)'}     | ${false} | ${'invalid'}
      ${'http://'}                | ${false} | ${'invalid'}
      ${'HTTP://.com'}            | ${false} | ${'invalid'}
      ${'http://foo'}             | ${true}  | ${'valid'}
      ${'http://foo.bar.baz.com'} | ${true}  | ${'valid'}
      ${'http://peer.test:3000'}  | ${true}  | ${'valid'}
      ${'https://foo'}            | ${true}  | ${'valid'}
    `('returns $result for $type HTTP url', ({ url, result }): void => {
      expect(isValidHttpUrl(url)).toEqual(result)
    })
  })

  describe('requestWithTimeout', (): void => {
    test('resolves request', async (): Promise<void> => {
      const expectedResult = true
      const timeoutMs = 10

      await expect(
        requestWithTimeout(async () => {
          await sleep(timeoutMs / 2)
          return true
        }, timeoutMs)
      ).resolves.toBe(expectedResult)
    })

    test('times out request', async (): Promise<void> => {
      const timeoutMs = 10

      await expect(
        requestWithTimeout(async () => {
          await sleep(timeoutMs + 1)
          return true
        }, timeoutMs)
      ).rejects.toThrow(new Error('Request timed out'))
    })
  })

  describe('poll', (): void => {
    const timedOutRequestError = new Error('Request timed out')
    test.each`
      pollingFrequencyMs | timeoutMs | requestDurationMs | numberOfRequests | requestCalledTimes | expectedResult          | description
      ${0}               | ${100}    | ${10}             | ${1}             | ${1}               | ${true}                 | ${'resolves single request'}
      ${1}               | ${1000}   | ${5}              | ${3}             | ${3}               | ${true}                 | ${'resolves request after polling multiple times'}
      ${1}               | ${30}     | ${20}             | ${2}             | ${2}               | ${timedOutRequestError} | ${'times out during request'}
      ${100}             | ${90}     | ${10}             | ${2}             | ${1}               | ${timedOutRequestError} | ${'times out in-between requests while polling'}
    `(
      '$description',
      async ({
        pollingFrequencyMs,
        timeoutMs,
        numberOfRequests,
        requestCalledTimes,
        requestDurationMs,
        expectedResult
      }): Promise<void> => {
        let mockRequest = jest.fn()

        for (let i = 0; i < numberOfRequests; i++) {
          mockRequest = mockRequest.mockResolvedValueOnce(
            i === numberOfRequests - 1 ? true : undefined // only last mock request is successful
          )
        }

        const pollingPromise = poll({
          request: async () => {
            const mockResponse = mockRequest()
            await sleep(requestDurationMs)
            return mockResponse
          },
          pollingFrequencyMs,
          timeoutMs
        })

        if (expectedResult instanceof Error) {
          await expect(pollingPromise).rejects.toThrow(expectedResult)
        } else {
          await expect(pollingPromise).resolves.toBe(expectedResult)
        }

        expect(mockRequest.mock.calls.length).toBe(requestCalledTimes)
      }
    )

    test('allows to set any predicate to stop polling', async (): Promise<void> => {
      const mockRequest = jest
        .fn()
        .mockResolvedValueOnce('error')
        .mockResolvedValueOnce('error')
        .mockResolvedValueOnce('ok')

      const pollingPromise = poll({
        request: async () => {
          const mockResponse = mockRequest()
          await sleep(1)
          return mockResponse
        },
        stopWhen: (result) => result === 'ok',
        pollingFrequencyMs: 1,
        timeoutMs: 1000
      })

      await expect(pollingPromise).resolves.toBe('ok')
      expect(mockRequest.mock.calls.length).toBe(3)
    })
  })

  describe('admin api signatures', (): void => {
    let deps: IocContract<AppServices>
    let appContainer: TestContainer
    let redis: Redis

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
})
