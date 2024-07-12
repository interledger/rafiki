import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { ConvertError, RatesService } from '../rates/service'
import { TestContainer, createTestApp } from '../tests/app'
import { mockCounter, mockHistogram } from '../tests/telemetry'
import { TelemetryService } from './service'
import { Counter, Histogram } from '@opentelemetry/api'

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

describe('TelemetryServiceImpl', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let telemetryService: TelemetryService
  let aseRatesService: RatesService
  let internalRatesService: RatesService

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

    // Reflect to access private class variable
    const counters: Map<string, any> = Reflect.get(telemetryService, 'counters')

    expect(counters.size).toBe(1)
    expect(counters.has(name)).toBe(true)

    const counter: Counter = counters.get(name)
    expect(counter.add).toHaveBeenCalledTimes(2)
  })

  it('should use existing histogram when recordHistogram is called for an existing metric', () => {
    const name = 'test_histogram'

    telemetryService.recordHistogram(name, 1)
    telemetryService.recordHistogram(name, 1)

    // Reflect to access private class variable
    const histograms: Map<string, any> = Reflect.get(
      telemetryService,
      'histograms'
    )

    expect(histograms.size).toBe(1)
    expect(histograms.has(name)).toBe(true)

    const histogram: Histogram = histograms.get(name)
    expect(histogram.record).toHaveBeenCalledTimes(2)
  })

  describe('conversion', () => {
    it('should try to convert using aseRatesService and fallback to internalRatesService', async () => {
      const aseConvertSpy = jest
        .spyOn(aseRatesService, 'convert')
        .mockImplementation(() =>
          Promise.resolve(ConvertError.InvalidDestinationPrice)
        )

      const internalConvertSpy = jest
        .spyOn(internalRatesService, 'convert')
        .mockImplementation(() => Promise.resolve(10000n))

      const converted = await telemetryService.convertAmount({
        sourceAmount: 100n,
        sourceAsset: { code: 'USD', scale: 2 }
      })

      expect(aseConvertSpy).toHaveBeenCalled()
      expect(internalConvertSpy).toHaveBeenCalled()
      expect(converted).toBe(10000n)
    })

    it('should not call the fallback internalRatesService if aseRatesService call is successful', async () => {
      const aseConvertSpy = jest
        .spyOn(aseRatesService, 'convert')
        .mockImplementation(() => Promise.resolve(500n))

      const internalConvertSpy = jest.spyOn(internalRatesService, 'convert')

      const converted = await telemetryService.convertAmount({
        sourceAmount: 100n,
        sourceAsset: { code: 'USD', scale: 2 }
      })

      expect(aseConvertSpy).toHaveBeenCalled()
      expect(internalConvertSpy).not.toHaveBeenCalled()
      expect(converted).toBe(500n)
    })
  })
})
