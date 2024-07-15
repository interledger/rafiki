import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { ConvertError, RatesService } from '../rates/service'
import { TestContainer, createTestApp } from '../tests/app'
import { mockCounter, mockHistogram } from '../tests/telemetry'
import { TelemetryService } from './service'

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

  it('should create a counter when getOrCreate is called for a new metric', () => {
    const counter = telemetryService.getOrCreateMetric('testMetric')
    expect(counter).toBe(mockCounter)
  })

  it('should return an existing counter when getOrCreate is called for an existing metric', () => {
    const existingCounter = telemetryService.getOrCreateMetric('existingMetric')
    const retrievedCounter =
      telemetryService.getOrCreateMetric('existingMetric')
    expect(retrievedCounter).toBe(existingCounter)
  })

  it('should create a histogram when getOrCreateHistogramMetric is called for a new metric', () => {
    const histogram = telemetryService.getOrCreateHistogramMetric('testMetric')
    expect(histogram).toBe(mockHistogram)
  })

  it('should return an existing histogram when getOrCreateHistogramMetric is called for an existing metric', () => {
    const existingHistogram =
      telemetryService.getOrCreateHistogramMetric('existingMetric')
    const retrievedHistogram =
      telemetryService.getOrCreateHistogramMetric('existingMetric')
    expect(retrievedHistogram).toBe(existingHistogram)
  })

  it('should return the instance name when calling getInstanceName', () => {
    const serviceName = telemetryService.getInstanceName()

    expect(serviceName).toBe('Rafiki')
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
