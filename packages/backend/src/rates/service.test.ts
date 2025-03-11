import { RatesService, ConvertError } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { CacheDataStore } from '../middleware/cache/data-stores'
import { mockRatesApi } from '../tests/rates'
import { AxiosInstance } from 'axios'
import {
  createTenantSettings,
  exchangeRatesSetting
} from '../tests/tenantSettings'
import { CreateOptions } from '../tenants/settings/service'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

describe('Rates service', function () {
  let tenantId: string
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let service: RatesService
  let apiRequestCount = 0
  const exchangeRatesLifetime = 100

  let tenantExchangeRatesUrl: string

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
      exchangeRatesLifetime
    })
    tenantId = Config.operatorTenantId
    const createOptions: CreateOptions = {
      tenantId: Config.operatorTenantId,
      setting: [exchangeRatesSetting()]
    }

    const tenantSetting = createTenantSettings(deps, createOptions)
    tenantExchangeRatesUrl = (await tenantSetting).value

    expect(tenantExchangeRatesUrl).not.toBe(undefined)

    appContainer = await createTestApp(deps)
    service = await deps.use('ratesService')
  })

  beforeEach(async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;((service as any).cache as CacheDataStore<string>).deleteAll()

    apiRequestCount = 0
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('convertSource', () => {
    beforeAll(() => {
      mockRatesApi(tenantExchangeRatesUrl, (base) => {
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
        service.convertSource(
          {
            sourceAmount: 1234n,
            sourceAsset: { code: 'USD', scale: 9 },
            destinationAsset: { code: 'USD', scale: 9 }
          },
          tenantId
        )
      ).resolves.toEqual({
        amount: 1234n,
        scaledExchangeRate: 1
      })
      expect(apiRequestCount).toBe(0)
    })

    it('scales the source amount when currencies are alike but scales are different', async () => {
      await expect(
        service.convertSource(
          {
            sourceAmount: 123n,
            sourceAsset: { code: 'USD', scale: 9 },
            destinationAsset: { code: 'USD', scale: 12 }
          },
          tenantId
        )
      ).resolves.toEqual({
        amount: 123_000n,
        scaledExchangeRate: 1000
      })
      await expect(
        service.convertSource(
          {
            sourceAmount: 123456n,
            sourceAsset: { code: 'USD', scale: 12 },
            destinationAsset: { code: 'USD', scale: 9 }
          },
          tenantId
        )
      ).resolves.toEqual({
        amount: 123n,
        scaledExchangeRate: 0.001
      })
      expect(apiRequestCount).toBe(0)
    })

    it('returns the converted amount when assets are different', async () => {
      const sourceAmount = 500
      await expect(
        service.convertSource(
          {
            sourceAmount: BigInt(sourceAmount),
            sourceAsset: { code: 'USD', scale: 2 },
            destinationAsset: { code: 'EUR', scale: 2 }
          },
          tenantId
        )
      ).resolves.toEqual({
        amount: BigInt(sourceAmount * exampleRates.USD.EUR),
        scaledExchangeRate: exampleRates.USD.EUR
      })
      await expect(
        service.convertSource(
          {
            sourceAmount: BigInt(sourceAmount),
            sourceAsset: { code: 'EUR', scale: 2 },
            destinationAsset: { code: 'USD', scale: 2 }
          },
          tenantId
        )
      ).resolves.toEqual({
        amount: BigInt(sourceAmount * exampleRates.EUR.USD),
        scaledExchangeRate: exampleRates.EUR.USD
      })
    })

    it('returns an error when an asset price is invalid', async () => {
      await expect(
        service.convertSource(
          {
            sourceAmount: 1234n,
            sourceAsset: { code: 'USD', scale: 2 },
            destinationAsset: { code: 'MISSING', scale: 2 }
          },
          tenantId
        )
      ).resolves.toBe(ConvertError.InvalidDestinationPrice)
      await expect(
        service.convertSource(
          {
            sourceAmount: 1234n,
            sourceAsset: { code: 'USD', scale: 2 },
            destinationAsset: { code: 'ZERO', scale: 2 }
          },
          tenantId
        )
      ).resolves.toBe(ConvertError.InvalidDestinationPrice)
      await expect(
        service.convertSource(
          {
            sourceAmount: 1234n,
            sourceAsset: { code: 'USD', scale: 2 },
            destinationAsset: { code: 'NEGATIVE', scale: 2 }
          },
          tenantId
        )
      ).resolves.toBe(ConvertError.InvalidDestinationPrice)
    })
  })

  describe('rates', function () {
    beforeAll(() => {
      mockRatesApi(tenantExchangeRatesUrl, (base) => {
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
          service.rates('USD', tenantId),
          service.rates('USD', tenantId),
          service.rates('USD', tenantId)
        ])
      ).resolves.toEqual([usdRates, usdRates, usdRates])
      expect(apiRequestCount).toBe(1)
    })

    it('handles concurrent requests for different asset codes', async () => {
      await expect(
        Promise.all([
          service.rates('USD', tenantId),
          service.rates('USD', tenantId),
          service.rates('EUR', tenantId),
          service.rates('EUR', tenantId)
        ])
      ).resolves.toEqual([usdRates, usdRates, eurRates, eurRates])
      expect(apiRequestCount).toBe(2)
    })

    it('returns cached request for same asset code', async () => {
      await expect(service.rates('USD', tenantId)).resolves.toEqual(usdRates)
      await expect(service.rates('USD', tenantId)).resolves.toEqual(usdRates)
      expect(apiRequestCount).toBe(1)
    })

    it('returns cached request for different asset codes', async () => {
      await expect(service.rates('USD', tenantId)).resolves.toEqual(usdRates)
      await expect(service.rates('USD', tenantId)).resolves.toEqual(usdRates)
      await expect(service.rates('EUR', tenantId)).resolves.toEqual(eurRates)
      await expect(service.rates('EUR', tenantId)).resolves.toEqual(eurRates)
      expect(apiRequestCount).toBe(2)
    })

    it('returns new rates after cache expires', async () => {
      await expect(service.rates('USD', tenantId)).resolves.toEqual(usdRates)
      jest.advanceTimersByTime(exchangeRatesLifetime + 1)
      await expect(service.rates('USD', tenantId)).resolves.toEqual(usdRates)
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

      await expect(service.rates('USD', tenantId)).rejects.toThrow(
        'Could not fetch rates'
      )
      await expect(service.rates('USD', tenantId)).resolves.toEqual(usdRates)
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
