import { RatesService, ConvertError, Rates } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { CacheDataStore } from '../middleware/cache/data-stores'
import nock from 'nock'

describe('Rates service', function () {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let service: RatesService
  let apiRequestCount = 0
  const exchangeRatesLifetime = 100
  const exchangeRatesUrl = 'http://example-rates.com'

  const testRates = {
    NEGATIVE: -0.5,
    ZERO: 0.0,
    STRING: '123'
  }

  const exampleRates: Record<string, object> = {
    XRP: {
      USD: 2
    },
    USD: {
      XRP: 0.5
    }
  }

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      exchangeRatesUrl,
      exchangeRatesLifetime
    })

    nock(exchangeRatesUrl)
      .get('/')
      .query(true)
      .reply(200, (url) => {
        apiRequestCount++

        const base = url.split('=')[1]

        return {
          base,
          rates: { ...testRates, ...exampleRates[base] }
        }
      })
      .persist()

    appContainer = await createTestApp(deps)
    service = await deps.use('ratesService')
  })

  beforeEach(async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;((service as any).cachedRates as CacheDataStore).deleteAll()

    apiRequestCount = 0
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
    jest.useRealTimers()
  })

  describe('convert', () => {
    it('returns the source amount when assets are alike', async () => {
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'USD', scale: 9 },
          destinationAsset: { code: 'USD', scale: 9 }
        })
      ).resolves.toBe(1234n)
      expect(apiRequestCount).toBe(0)
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
      expect(apiRequestCount).toBe(0)
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
          sourceAsset: { code: 'USD', scale: 9 },
          destinationAsset: { code: 'MISSING', scale: 9 }
        })
      ).resolves.toBe(ConvertError.MissingDestinationAsset)
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'MISSING', scale: 9 },
          destinationAsset: { code: 'USD', scale: 9 }
        })
      ).resolves.toBe(ConvertError.MissingDestinationAsset) // checkBaseAsset assumes we always return a base (source) asset
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'NEGATIVE', scale: 9 },
          destinationAsset: { code: 'EUR', scale: 9 }
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
  })

  describe('rates', function () {
    beforeEach(async (): Promise<void> => {
      jest.useFakeTimers({
        now: Date.now(),
        doNotFake: ['nextTick', 'setImmediate']
      })
    })

    const usdRates = {
      ...testRates,
      ...exampleRates['USD'],
      USD: 1
    }

    const xrpRates = {
      ...testRates,
      ...exampleRates['XRP'],
      XRP: 1
    }

    it('handles concurrent requests for same asset code', async () => {
      await expect(
        Promise.all([
          service.rates('USD'),
          service.rates('USD'),
          service.rates('USD')
        ])
      ).resolves.toEqual([usdRates, usdRates, usdRates])
      expect(apiRequestCount).toBe(1)
    })

    it('handles concurrent requests for different asset codes', async () => {
      await expect(
        Promise.all([
          service.rates('USD'),
          service.rates('USD'),
          service.rates('XRP'),
          service.rates('XRP')
        ])
      ).resolves.toEqual([usdRates, usdRates, xrpRates, xrpRates])
      expect(apiRequestCount).toBe(2)
    })

    it('returns cached request for same asset code', async () => {
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      expect(apiRequestCount).toBe(1)
    })

    it('returns cached request for different asset codes', async () => {
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      await expect(service.rates('XRP')).resolves.toEqual(xrpRates)
      await expect(service.rates('XRP')).resolves.toEqual(xrpRates)
      expect(apiRequestCount).toBe(2)
    })

    it('prefetches when the cached request is old', async () => {
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      jest.advanceTimersByTime(exchangeRatesLifetime * 0.5 + 1)
      // ... cache isn't expired yet, but it will be soon
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      expect(apiRequestCount).toBe(1)

      // Invalidate the cache.
      jest.advanceTimersByTime(exchangeRatesLifetime * 0.5 + 1)
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      // The prefetch response is promoted to the cache.
      expect(apiRequestCount).toBe(2)
    })

    it('cannot use an expired cache', async () => {
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      jest.advanceTimersByTime(exchangeRatesLifetime + 1)
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      expect(apiRequestCount).toBe(2)
    })
  })

  describe('checkBaseAsset', (): void => {
    it.each`
      asset        | description
      ${undefined} | ${'is not provided'}
      ${['USD']}   | ${'is not a string'}
      ${''}        | ${'is an empty string'}
    `(`throws if base asset $description`, ({ asset }): void => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (<any>service).checkBaseAsset(asset)).toThrow()
    })
  })
})
