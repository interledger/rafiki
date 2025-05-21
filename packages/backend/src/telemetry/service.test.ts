import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { ConvertError, RatesService } from '../rates/service'
import { TestContainer, createTestApp } from '../tests/app'
import { mockCounter, mockHistogram } from '../tests/telemetry'
import {
  NoopTelemetryServiceImpl,
  TelemetryService,
  TelemetryServiceImpl
} from './service'
import { Counter, Histogram } from '@opentelemetry/api'
import { privacy } from './privacy'
import { mockRatesApi } from '../tests/rates'
import { ConvertResults } from '../rates/util'
import {
  createTenantSettings,
  exchangeRatesSetting
} from '../tests/tenantSettings'
import { CreateOptions } from '../tenants/settings/service'

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
  describe('Telemetry Enabled', () => {
    let deps: IocContract<AppServices>
    let appContainer: TestContainer
    let telemetryService: TelemetryService
    let aseRatesService: RatesService
    let internalRatesService: RatesService

    let apiRequestCount = 0

    const tenantId = Config.operatorTenantId

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
        telemetryExchangeRatesLifetime: 100,
        openTelemetryCollectors: []
      })

      appContainer = await createTestApp(deps)
      telemetryService = await deps.use('telemetry')
      aseRatesService = await deps.use('ratesService')
      internalRatesService = await deps.use('internalRatesService')

      const createOptions: CreateOptions = {
        tenantId,
        setting: [exchangeRatesSetting()]
      }

      const tenantSetting = createTenantSettings(deps, createOptions)
      const operatorExchangeRatesUrl = (await tenantSetting).value

      mockRatesApi(operatorExchangeRatesUrl, (base) => {
        apiRequestCount++
        return exampleRates[base as keyof typeof exampleRates]
      })
    })

    afterAll(async (): Promise<void> => {
      await appContainer.shutdown()
    })

    test('telemetryService instance should be real implementation', () => {
      expect(telemetryService instanceof TelemetryServiceImpl).toBe(true)
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
        const spyAseConvert = jest.spyOn(aseRatesService, 'convertSource')
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
          },
          tenantId
        )

        expect(spyAseConvert).toHaveBeenCalled()
        expect(spyIncCounter).not.toHaveBeenCalled()
      })

      it('should not record fee negative fee value', async () => {
        const spyConvert = jest.spyOn(aseRatesService, 'convertSource')
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
        const spyConvert = jest.spyOn(aseRatesService, 'convertSource')
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
        const spyConvert = jest.spyOn(aseRatesService, 'convertSource')
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
          }),
          undefined
        )
        expect(spyConvert).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            sourceAmount: destination.value,
            sourceAsset: {
              code: destination.assetCode,
              scale: destination.assetScale
            }
          }),
          undefined
        )
        // Ensure the [incrementCounter] was called with the correct calculated value. Expected 5000 due to scale = 4.
        expect(spyIncCounter).toHaveBeenCalledWith(name, 5000, {})
      })

      it('should record since it is a valid fee for different assets', async () => {
        const spyConvert = jest.spyOn(aseRatesService, 'convertSource')
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
          }),
          undefined
        )
        expect(spyConvert).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            sourceAmount: destination.value,
            sourceAsset: {
              code: destination.assetCode,
              scale: destination.assetScale
            }
          }),
          undefined
        )
        expect(spyIncCounter).toHaveBeenCalledWith(name, 4400, {})
        expect(apiRequestCount).toBe(1)
      })
    })

    describe('incrementCounterWithTransactionAmount', () => {
      it('should try to convert using aseRatesService and fallback to internalRatesService', async () => {
        const aseConvertSpy = jest
          .spyOn(aseRatesService, 'convertSource')
          .mockImplementation(() =>
            Promise.resolve(ConvertError.InvalidDestinationPrice)
          )
        const internalConvertSpy = jest
          .spyOn(internalRatesService, 'convertSource')
          .mockImplementation(() =>
            Promise.resolve({ amount: 10_000n, scaledExchangeRate: 1 })
          )

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
          .spyOn(aseRatesService, 'convertSource')
          .mockImplementation(() =>
            Promise.resolve({ amount: 500n, scaledExchangeRate: 1 })
          )
        const internalConvertSpy = jest.spyOn(
          internalRatesService,
          'convertSource'
        )

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

      it('should apply privacy by default', async () => {
        const convertedAmount = 500n

        jest
          //"any" to access private ts class member variable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(telemetryService as any, 'convertAmount')
          .mockResolvedValueOnce({
            scaledExchangeRate: 1,
            amount: convertedAmount
          } as ConvertResults)
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
        expect(incrementCounterSpy).toHaveBeenCalledWith(counterName, 123, {})
      })

      it('should not apply privacy if preservePrivacy is false', async () => {
        const convertedAmount = 500n

        jest
          //"any" to access private ts class member variable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(telemetryService as any, 'convertAmount')
          .mockResolvedValueOnce({
            scaledExchangeRate: 1,
            amount: convertedAmount
          } as ConvertResults)

        const applyPrivacySpy = jest.spyOn(privacy, 'applyPrivacy')
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
          },
          undefined,
          undefined,
          false
        )

        expect(applyPrivacySpy).not.toHaveBeenCalled()
        expect(incrementCounterSpy).toHaveBeenCalledWith(
          counterName,
          Number(convertedAmount),
          {}
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
          .mockResolvedValueOnce({
            scaledExchangeRate: 1,
            amount: 100n
          } as ConvertResults)
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
          },
          undefined,
          { attribute: 'metric attribute' }
        )

        expect(convertSpy).toHaveBeenCalled()
        expect(incrementCounterSpy).toHaveBeenCalledWith(
          counterName,
          obfuscatedAmount,
          { attribute: 'metric attribute' }
        )
      })
    })

    describe('startTimer', () => {
      beforeEach(() => {
        jest.useFakeTimers()
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should return a function', () => {
        const stopTimer = telemetryService.startTimer('test_timer')
        expect(typeof stopTimer).toBe('function')
      })

      it('should record histogram with elapsed time and initial attributes', () => {
        const recordHistogramSpy = jest.spyOn(
          telemetryService,
          'recordHistogram'
        )
        const stopTimer = telemetryService.startTimer('test_timer', {
          initialAttr: 'value'
        })

        jest.advanceTimersByTime(1000)
        stopTimer()

        expect(recordHistogramSpy).toHaveBeenCalledWith(
          'test_timer',
          1000,
          expect.objectContaining({ initialAttr: 'value' })
        )
      })

      it('should merge initial attributes with additional attributes', () => {
        const recordHistogramSpy = jest.spyOn(
          telemetryService,
          'recordHistogram'
        )
        const stopTimer = telemetryService.startTimer('test_timer', {
          initialAttr: 'value'
        })

        jest.advanceTimersByTime(1000)
        stopTimer({ additionalAttr: 'newValue' })

        expect(recordHistogramSpy).toHaveBeenCalledWith(
          'test_timer',
          1000,
          expect.objectContaining({
            initialAttr: 'value',
            additionalAttr: 'newValue'
          })
        )
      })

      it('should override initial attributes with additional attributes if keys conflict', () => {
        const recordHistogramSpy = jest.spyOn(
          telemetryService,
          'recordHistogram'
        )
        const stopTimer = telemetryService.startTimer('test_timer', {
          attr: 'initialValue'
        })

        jest.advanceTimersByTime(1000)
        stopTimer({ attr: 'newValue' })

        expect(recordHistogramSpy).toHaveBeenCalledWith(
          'test_timer',
          1000,
          expect.objectContaining({ attr: 'newValue' })
        )
      })

      it('should work without initial attributes', () => {
        const recordHistogramSpy = jest.spyOn(
          telemetryService,
          'recordHistogram'
        )
        const stopTimer = telemetryService.startTimer('test_timer')

        jest.advanceTimersByTime(1000)
        stopTimer({ attr: 'value' })

        expect(recordHistogramSpy).toHaveBeenCalledWith(
          'test_timer',
          1000,
          expect.objectContaining({ attr: 'value' })
        )
      })

      it('should work without additional attributes', () => {
        const recordHistogramSpy = jest.spyOn(
          telemetryService,
          'recordHistogram'
        )
        const stopTimer = telemetryService.startTimer('test_timer', {
          initialAttr: 'value'
        })

        jest.advanceTimersByTime(1000)
        stopTimer()

        expect(recordHistogramSpy).toHaveBeenCalledWith(
          'test_timer',
          1000,
          expect.objectContaining({ initialAttr: 'value' })
        )
      })
    })
  })
  describe('Telemetry Disabled', () => {
    let deps: IocContract<AppServices>
    let appContainer: TestContainer
    let telemetryService: TelemetryService

    beforeAll(async (): Promise<void> => {
      deps = initIocContainer({
        ...Config,
        enableTelemetry: false
      })
      appContainer = await createTestApp(deps)
      telemetryService = await deps.use('telemetry')!
    })

    afterAll(async (): Promise<void> => {
      await appContainer.shutdown()
    })

    test('telemetryService instance should be no-op implementation', () => {
      expect(telemetryService instanceof NoopTelemetryServiceImpl).toBe(true)
    })

    test('NoopTelemetryServiceImpl should not get meter ', () => {
      telemetryService.recordHistogram('testhistogram', 1)
      telemetryService.incrementCounter('testcounter', 1)

      expect(mockCounter.add).toHaveBeenCalledTimes(0)
      expect(mockHistogram.record).toHaveBeenCalledTimes(0)
    })
  })
})
