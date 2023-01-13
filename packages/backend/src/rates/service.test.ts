import Koa from 'koa'

import { RatesService, ConvertError } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'

describe('Rates service', function () {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let service: RatesService
  let requestCount = 0
  const pricesLifetime = 100
  const koa = new Koa()
  koa.use(function (ctx) {
    requestCount++
    ctx.body = {
      base: 'USD',
      rates: {
        XRP: 0.5,
        NEGATIVE: -0.5,
        ZERO: 0.0,
        STRING: '123'
      }
    }
  })
  const server = koa.listen(3210)

  beforeAll(async (): Promise<void> => {
    const config = Config
    config.pricesLifetime = pricesLifetime
    config.pricesUrl = 'http://127.0.0.1:3210/'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    jest.useFakeTimers()
    jest.setSystemTime(1600000000000)
  })

  beforeEach(async (): Promise<void> => {
    // Fast-forward to reset the cache between tests.
    jest.setSystemTime(Date.now() + pricesLifetime + 1)
    service = await deps.use('ratesService')
    requestCount = 0
  })

  afterAll(async (): Promise<void> => {
    jest.useRealTimers()
    await new Promise((resolve, reject) => {
      server.close((err?: Error) => (err ? reject(err) : resolve(null)))
    })
    await appContainer.shutdown()
  })

  describe('convert', function () {
    it('returns the source amount when assets are alike', async () => {
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'USD', scale: 9 },
          destinationAsset: { code: 'USD', scale: 9 }
        })
      ).resolves.toBe(1234n)
      expect(requestCount).toBe(0)
    })

    it('scales the source amount when currencies are alike but scales are different', async () => {
      await expect(
        service.convert({
          sourceAmount: 123n,
          sourceAsset: { code: 'USD', scale: 9 },
          destinationAsset: { code: 'USD', scale: 12 }
        })
      ).resolves.toBe(123_000n)
      await expect(
        service.convert({
          sourceAmount: 123456n,
          sourceAsset: { code: 'USD', scale: 12 },
          destinationAsset: { code: 'USD', scale: 9 }
        })
      ).resolves.toBe(123n)
      expect(requestCount).toBe(0)
    })

    it('returns the converted amount when assets are different', async () => {
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'USD', scale: 9 },
          destinationAsset: { code: 'XRP', scale: 9 }
        })
      ).resolves.toBe(1234n * 2n)
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'XRP', scale: 9 },
          destinationAsset: { code: 'USD', scale: 9 }
        })
      ).resolves.toBe(1234n / 2n)
    })

    it('returns an error when an asset price is invalid', async () => {
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'MISSING', scale: 9 },
          destinationAsset: { code: 'USD', scale: 9 }
        })
      ).resolves.toBe(ConvertError.MissingSourceAsset)
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'USD', scale: 9 },
          destinationAsset: { code: 'MISSING', scale: 9 }
        })
      ).resolves.toBe(ConvertError.MissingDestinationAsset)
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'NEGATIVE', scale: 9 },
          destinationAsset: { code: 'USD', scale: 9 }
        })
      ).resolves.toBe(ConvertError.InvalidSourcePrice)
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'USD', scale: 9 },
          destinationAsset: { code: 'STRING', scale: 9 }
        })
      ).resolves.toBe(ConvertError.InvalidDestinationPrice)
    })

    describe('caching', function () {
      const opts = {
        sourceAmount: 1234n,
        sourceAsset: { code: 'USD', scale: 9 },
        destinationAsset: { code: 'XRP', scale: 9 }
      }

      afterEach(async () => {
        // Await it so that the test can clean up properly.
        if (service['prefetchRequest']) await service['prefetchRequest']
      })

      it('caches requests', async () => {
        await expect(
          Promise.all([
            service.convert(opts),
            service.convert(opts),
            service.convert(opts)
          ])
        ).resolves.toEqual([1234n * 2n, 1234n * 2n, 1234n * 2n])
        expect(requestCount).toBe(1)
      })

      it('prefetches when the cached request is old', async () => {
        await expect(service.convert(opts)).resolves.toBe(1234n * 2n) // setup initial rate
        jest.advanceTimersByTime(pricesLifetime * 0.5 + 1)
        // ... cache isn't expired yet, but it will be soon
        await expect(service.convert(opts)).resolves.toBe(1234n * 2n)
        expect(service['prefetchRequest']).toBeDefined()
        // The prefetch isn't done.
        expect(requestCount).toBe(1)

        // Invalidate the cache.
        jest.advanceTimersByTime(pricesLifetime * 0.5 + 1)
        await expect(service.convert(opts)).resolves.toBe(1234n * 2n)
        // The prefetch response is promoted to the cache.
        expect(service['prefetchRequest']).toBeUndefined()
        expect(requestCount).toBe(2)
      })

      it('cannot use an expired cache', async () => {
        await expect(service.convert(opts)).resolves.toBe(1234n * 2n) // setup initial rate
        jest.advanceTimersByTime(pricesLifetime + 1)
        await expect(service.convert(opts)).resolves.toBe(1234n * 2n)
        expect(service['prefetchRequest']).toBeUndefined()
        expect(requestCount).toBe(2)
      })
    })
  })
})
