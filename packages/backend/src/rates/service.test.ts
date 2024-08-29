import { RatesService, ConvertError } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { CacheDataStore } from '../middleware/cache/data-stores'
import { mockRatesApi } from '../tests/rates'
import { AxiosInstance } from 'axios'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

describe('Rates service', function () {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let service: RatesService
  let apiRequestCount = 0
  const exchangeRatesLifetime = 100
  const exchangeRatesUrl = 'http://example-rates.com'

  const exampleRates = {
    USD: {
      EUR: 2,
      XRP: 1.65
    },
    EUR: {
      USD: 1.12,
      XRP: 1.82
    },
    XRP: {
      USD: 0.61,
      EUR: 0.5
    }
  }

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      exchangeRatesUrl,
      exchangeRatesLifetime
    })

    appContainer = await createTestApp(deps)
    service = await deps.use('ratesService')
  })

  beforeEach(async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;((service as any).cachedRates as CacheDataStore).deleteAll()

    apiRequestCount = 0
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('convert', () => {
    beforeAll(() => {
      mockRatesApi(exchangeRatesUrl, (base) => {
        apiRequestCount++
        return exampleRates[base as keyof typeof exampleRates]
      })
    })

    afterAll(() => {
      nock.cleanAll()
      nock.abortPendingRequests()
      nock.restore()
      nock.activate()
    })

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
      const sourceAmount = 500
      await expect(
        service.convert({
          sourceAmount: BigInt(sourceAmount),
          sourceAsset: { code: 'USD', scale: 2 },
          destinationAsset: { code: 'EUR', scale: 2 }
        })
      ).resolves.toBe(BigInt(sourceAmount * exampleRates.USD.EUR))
      await expect(
        service.convert({
          sourceAmount: BigInt(sourceAmount),
          sourceAsset: { code: 'EUR', scale: 2 },
          destinationAsset: { code: 'USD', scale: 2 }
        })
      ).resolves.toBe(BigInt(sourceAmount * exampleRates.EUR.USD))
    })

    it('returns an error when an asset price is invalid', async () => {
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'USD', scale: 2 },
          destinationAsset: { code: 'MISSING', scale: 2 }
        })
      ).resolves.toBe(ConvertError.InvalidDestinationPrice)
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'USD', scale: 2 },
          destinationAsset: { code: 'ZERO', scale: 2 }
        })
      ).resolves.toBe(ConvertError.InvalidDestinationPrice)
      await expect(
        service.convert({
          sourceAmount: 1234n,
          sourceAsset: { code: 'USD', scale: 2 },
          destinationAsset: { code: 'NEGATIVE', scale: 2 }
        })
      ).resolves.toBe(ConvertError.InvalidDestinationPrice)
    })
  })

  describe('rates', function () {
    beforeAll(() => {
      mockRatesApi(exchangeRatesUrl, (base) => {
        apiRequestCount++
        return exampleRates[base as keyof typeof exampleRates]
      })
    })

    afterAll(() => {
      nock.cleanAll()
      nock.abortPendingRequests()
      nock.restore()
      nock.activate()
    })

    beforeEach(async (): Promise<void> => {
      jest.useFakeTimers({
        now: Date.now(),
        doNotFake: ['nextTick', 'setImmediate']
      })
    })

    const usdRates = {
      base: 'USD',
      rates: exampleRates.USD
    }

    const eurRates = {
      base: 'EUR',
      rates: exampleRates.EUR
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
          service.rates('EUR'),
          service.rates('EUR')
        ])
      ).resolves.toEqual([usdRates, usdRates, eurRates, eurRates])
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
      await expect(service.rates('EUR')).resolves.toEqual(eurRates)
      await expect(service.rates('EUR')).resolves.toEqual(eurRates)
      expect(apiRequestCount).toBe(2)
    })

    it('returns new rates after cache expires', async () => {
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      jest.advanceTimersByTime(exchangeRatesLifetime + 1)
      await expect(service.rates('USD')).resolves.toEqual(usdRates)
      expect(apiRequestCount).toBe(2)
    })

    it('returns rates on second request (first one was error)', async () => {
      jest
        .spyOn(
          (service as RatesService & { axios: AxiosInstance }).axios,
          'get'
        )
        .mockImplementationOnce(() => {
          apiRequestCount++
          throw new Error()
        })

      await expect(service.rates('USD')).rejects.toThrow(
        'Could not fetch rates'
      )
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
