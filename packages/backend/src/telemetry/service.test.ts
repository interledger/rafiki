import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { ConvertError, RatesService } from '../rates/service'
import { TestContainer, createTestApp } from '../tests/app'
import { mockCounter, mockHistogram } from '../tests/telemetry'
import {
  createTelemetryService,
  NoopTelemetryServiceImpl,
  TelemetryService,
  TelemetryServiceImpl,
  TelemetryServiceDependencies
} from './service'
import { Counter, Histogram } from '@opentelemetry/api'
import { privacy } from './privacy'
import { mockRatesApi } from '../tests/rates'

jest.mock('@opentelemetry/api', () => ({
  ...jest.requireActual('@opentelemetry/api'),
  metrics: {
    setGlobalMeterProvider: jest.fn(),
    getMeter: jest.fn().mockReturnValue({
      createCounter: jest.fn().mockImplementation(() => mockCounter),
      createHistogram: jest.fn().mockImplementation(() => mockHistogram)
    })
  }
}))

jest.mock('@opentelemetry/resources', () => ({ Resource: jest.fn() }))

jest.mock('@opentelemetry/sdk-metrics', () => ({
  MeterProvider: jest.fn().mockImplementation(() => ({
    shutdown: jest.fn(),
    addMetricReader: jest.fn()
  }))
}))

describe('Telemetry Service', () => {
  describe('Telemtry Enabled', () => {
    let deps: IocContract<AppServices>
    let appContainer: TestContainer
    let telemetryService: TelemetryService
    let aseRatesService: RatesService
    let internalRatesService: RatesService

    let apiRequestCount = 0
    const exchangeRatesUrl = 'http://example-rates.com'

    const exampleRates = {
      USD: {
        EUR: 2
      },
      EUR: {
        USD: 1.12
      }
    }

    beforeAll(async (): Promise<void> => {
      deps = initIocContainer({
        ...Config,
        enableTelemetry: true,
        telemetryExchangeRatesUrl: 'http://example-rates.com',
        telemetryExchangeRatesLifetime: 100,
        openTelemetryCollectors: []
      })

      appContainer = await createTestApp(deps)
      telemetryService = await deps.use('telemetry')!
      aseRatesService = await deps.use('ratesService')!
      internalRatesService = await deps.use('internalRatesService')!

      mockRatesApi(exchangeRatesUrl, (base) => {
        apiRequestCount++
        return exampleRates[base as keyof typeof exampleRates]
      })
    })

    afterAll(async (): Promise<void> => {
      await appContainer.shutdown()
    })

    it('should create a counter with source attribute for a new metric', () => {
      const name = 'test_counter'
      const amount = 1
      const attributes = { test: 'attribute' }

      telemetryService.incrementCounter(name, amount, attributes)

      expect(mockCounter.add).toHaveBeenCalledWith(
        amount,
        expect.objectContaining({
          ...attributes,
          source: expect.any(String)
        })
      )
    })

    it('should create a histogram with source attribute for a new metric', () => {
      const name = 'test_histogram'
      const amount = 1
      const attributes = { test: 'attribute' }

      telemetryService.recordHistogram(name, amount, attributes)

      expect(mockHistogram.record).toHaveBeenCalledWith(
        amount,
        expect.objectContaining({
          ...attributes,
          source: expect.any(String)
        })
      )
    })

    it('should use existing counter when incrementCounter is called for an existing metric', () => {
      const name = 'test_counter'

      telemetryService.incrementCounter(name, 1)
      telemetryService.incrementCounter(name, 1)

      //"any" to access private ts class member variable
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const counters: Map<string, Counter> = (telemetryService as any).counters

      expect(counters.size).toBe(1)
      expect(counters.has(name)).toBe(true)

      const counter = counters.get(name)
      expect(counter?.add).toHaveBeenCalledTimes(2)
    })

    it('should use existing histogram when recordHistogram is called for an existing metric', () => {
      const name = 'test_histogram'

      telemetryService.recordHistogram(name, 1)
      telemetryService.recordHistogram(name, 1)

      //"any" to access private ts class member variable
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const histograms: Map<string, Histogram> = (telemetryService as any)
        .histograms

      expect(histograms.size).toBe(1)
      expect(histograms.has(name)).toBe(true)

      const histogram = histograms.get(name)
      expect(histogram?.record).toHaveBeenCalledTimes(2)
    })

    describe('incrementCounterWithTransactionAmountDifference', () => {
      it('should not record fee when there is no fee value', async () => {
        const spyAseConvert = jest.spyOn(aseRatesService, 'convert')
        const spyIncCounter = jest.spyOn(telemetryService, 'incrementCounter')

        await telemetryService.incrementCounterWithTransactionAmountDifference(
          'test_amount_diff_counter',
          {
            value: 100n,
            assetCode: 'USD',
            assetScale: 2
          },
          {
            value: 100n,
            assetCode: 'USD',
            assetScale: 2
          }
        )

        expect(spyAseConvert).toHaveBeenCalled()
        expect(spyIncCounter).not.toHaveBeenCalled()
      })

      it('should not record fee negative fee value', async () => {
        const spyConvert = jest.spyOn(aseRatesService, 'convert')
        const spyIncCounter = jest.spyOn(telemetryService, 'incrementCounter')

        await telemetryService.incrementCounterWithTransactionAmountDifference(
          'test_amount_diff_counter',
          {
            value: 100n,
            assetCode: 'USD',
            assetScale: 2
          },
          {
            value: 101n,
            assetCode: 'USD',
            assetScale: 2
          }
        )

        expect(spyConvert).toHaveBeenCalled()
        expect(spyIncCounter).not.toHaveBeenCalled()
      })

      it('should not record zero amounts', async () => {
        const spyConvert = jest.spyOn(aseRatesService, 'convert')
        const spyIncCounter = jest.spyOn(telemetryService, 'incrementCounter')

        await telemetryService.incrementCounterWithTransactionAmountDifference(
          'test_amount_diff_counter',
          {
            value: 0n,
            assetCode: 'USD',
            assetScale: 2
          },
          {
            value: 0n,
            assetCode: 'USD',
            assetScale: 2
          }
        )

        expect(spyConvert).not.toHaveBeenCalled()
        expect(spyIncCounter).not.toHaveBeenCalled()
      })

      it('should record since it is a valid fee', async () => {
        const spyConvert = jest.spyOn(aseRatesService, 'convert')
        const spyIncCounter = jest.spyOn(telemetryService, 'incrementCounter')

        const source = {
          value: 100n,
          assetCode: 'USD',
          assetScale: 2
        }
        const destination = {
          value: 50n,
          assetCode: 'USD',
          assetScale: 2
        }

        const name = 'test_amount_diff_counter'
        await telemetryService.incrementCounterWithTransactionAmountDifference(
          name,
          source,
          destination
        )

        expect(spyConvert).toHaveBeenCalledTimes(2)
        expect(spyConvert).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            sourceAmount: source.value,
            sourceAsset: { code: source.assetCode, scale: source.assetScale }
          })
        )
        expect(spyConvert).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            sourceAmount: destination.value,
            sourceAsset: {
              code: destination.assetCode,
              scale: destination.assetScale
            }
          })
        )
        // Ensure the [incrementCounter] was called with the correct calculated value. Expected 5000 due to scale = 4.
        expect(spyIncCounter).toHaveBeenCalledWith(name, 5000, {})
      })

      it('should record since it is a valid fee for different assets', async () => {
        const spyConvert = jest.spyOn(aseRatesService, 'convert')
        const spyIncCounter = jest.spyOn(telemetryService, 'incrementCounter')

        const source = {
          value: 100n,
          assetCode: 'USD',
          assetScale: 2
        }
        const destination = {
          value: 50n,
          assetCode: 'EUR',
          assetScale: 2
        }

        const name = 'test_amount_diff_counter'
        await telemetryService.incrementCounterWithTransactionAmountDifference(
          name,
          source,
          destination
        )

        expect(spyConvert).toHaveBeenCalledTimes(2)
        expect(spyConvert).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            sourceAmount: source.value,
            sourceAsset: { code: source.assetCode, scale: source.assetScale }
          })
        )
        expect(spyConvert).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            sourceAmount: destination.value,
            sourceAsset: {
              code: destination.assetCode,
              scale: destination.assetScale
            }
          })
        )
        expect(spyIncCounter).toHaveBeenCalledWith(name, 4400, {})
        expect(apiRequestCount).toBe(1)
      })
    })

    describe('incrementCounterWithTransactionAmount', () => {
      it('should try to convert using aseRatesService and fallback to internalRatesService', async () => {
        const aseConvertSpy = jest
          .spyOn(aseRatesService, 'convert')
          .mockImplementation(() =>
            Promise.resolve(ConvertError.InvalidDestinationPrice)
          )
        const internalConvertSpy = jest
          .spyOn(internalRatesService, 'convert')
          .mockImplementation(() => Promise.resolve(10000n))

        await telemetryService.incrementCounterWithTransactionAmount(
          'test_counter',
          {
            value: 100n,
            assetCode: 'USD',
            assetScale: 2
          }
        )

        expect(aseConvertSpy).toHaveBeenCalled()
        expect(internalConvertSpy).toHaveBeenCalled()
      })

      it('should not call the fallback internalRatesService if aseRatesService call is successful', async () => {
        const aseConvertSpy = jest
          .spyOn(aseRatesService, 'convert')
          .mockImplementation(() => Promise.resolve(500n))
        const internalConvertSpy = jest.spyOn(internalRatesService, 'convert')

        await telemetryService.incrementCounterWithTransactionAmount(
          'test_counter',
          {
            value: 100n,
            assetCode: 'USD',
            assetScale: 2
          }
        )

        expect(aseConvertSpy).toHaveBeenCalled()
        expect(internalConvertSpy).not.toHaveBeenCalled()
      })

      it('should apply privacy', async () => {
        const convertedAmount = 500n

        jest
          //"any" to access private ts class member variable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(telemetryService as any, 'convertAmount')
          .mockImplementation(() => Promise.resolve(convertedAmount))
        const applyPrivacySpy = jest
          .spyOn(privacy, 'applyPrivacy')
          .mockReturnValue(123)
        const incrementCounterSpy = jest.spyOn(
          telemetryService,
          'incrementCounter'
        )

        const counterName = 'test_counter'
        await telemetryService.incrementCounterWithTransactionAmount(
          counterName,
          {
            value: 100n,
            assetCode: 'USD',
            assetScale: 2
          }
        )

        expect(applyPrivacySpy).toHaveBeenCalledWith(Number(convertedAmount))
        expect(incrementCounterSpy).toHaveBeenCalledWith(
          counterName,
          123,
          expect.any(Object)
        )
      })

      it('should not collect telemetry when conversion returns InvalidDestinationPrice', async () => {
        const convertSpy = jest
          //"any" to access private ts class member variable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(telemetryService as any, 'convertAmount')
          .mockImplementation(() =>
            Promise.resolve(ConvertError.InvalidDestinationPrice)
          )

        const incrementCounterSpy = jest.spyOn(
          telemetryService,
          'incrementCounter'
        )

        await telemetryService.incrementCounterWithTransactionAmount(
          'test_counter',
          {
            value: 100n,
            assetCode: 'USD',
            assetScale: 2
          }
        )

        expect(convertSpy).toHaveBeenCalled()
        expect(incrementCounterSpy).not.toHaveBeenCalled()
      })

      it('should collect telemetry when conversion is successful', async () => {
        const convertSpy = jest
          //"any" to access private ts class member variable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(telemetryService as any, 'convertAmount')
          .mockImplementation(() => Promise.resolve(10000n))
        const incrementCounterSpy = jest.spyOn(
          telemetryService,
          'incrementCounter'
        )
        const obfuscatedAmount = 12000
        jest.spyOn(privacy, 'applyPrivacy').mockReturnValue(obfuscatedAmount)

        const counterName = 'test_counter'

        await telemetryService.incrementCounterWithTransactionAmount(
          counterName,
          {
            value: 100n,
            assetCode: 'USD',
            assetScale: 2
          }
        )

        expect(convertSpy).toHaveBeenCalled()
        expect(incrementCounterSpy).toHaveBeenCalledWith(
          counterName,
          obfuscatedAmount,
          expect.any(Object)
        )
      })
    })
  })
  describe('Telemetry Disabled', () => {
    let deps: TelemetryServiceDependencies

    beforeEach(() => {
      deps = {
        enableTelemetry: false
      } as TelemetryServiceDependencies
    })

    test('should return NoopTelemetryServiceImpl when enableTelemetry is false', () => {
      const telemetryService = createTelemetryService(deps)

      expect(telemetryService).toBeInstanceOf(NoopTelemetryServiceImpl)
    })

    test('should return TelemetryServiceImpl when enableTelemetry is true', () => {
      deps.enableTelemetry = true
      const telemetryService = createTelemetryService(deps)

      expect(telemetryService).toBeInstanceOf(TelemetryServiceImpl)
    })

    test('NoopTelemetryServiceImpl should not get meter ', () => {
      const telemetryService = createTelemetryService(deps)
      telemetryService.recordHistogram('testhistogram', 1)
      telemetryService.incrementCounter('testcounter', 1)

      expect(mockCounter.add).toHaveBeenCalledTimes(0)
      expect(mockHistogram.record).toHaveBeenCalledTimes(0)
    })
  })
})
