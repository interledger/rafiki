import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { ConvertError, RatesService } from '../rates/service'
import { TestContainer, createTestApp } from '../tests/app'
import { mockCounter } from '../tests/telemetry'
import { TelemetryService } from './service'

jest.mock('@opentelemetry/api', () => ({
  ...jest.requireActual('@opentelemetry/api'),
  metrics: {
    setGlobalMeterProvider: jest.fn(),
    getMeter: jest.fn().mockReturnValue({
      createCounter: jest.fn().mockImplementation(() => mockCounter)
    })
  }
}))

jest.mock('@opentelemetry/exporter-metrics-otlp-grpc', () => ({
  OTLPMetricExporter: jest.fn().mockImplementation(() => ({}))
}))

jest.mock('@opentelemetry/sdk-metrics', () => ({
  MeterProvider: jest.fn().mockImplementation(() => ({
    addMetricReader: jest.fn()
  })),
  PeriodicExportingMetricReader: jest.fn().mockImplementation(() => ({}))
}))

describe('TelemetryServiceImpl', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let telemetryService: TelemetryService
  let aseRatesService: RatesService
  let fallbackRatesService: RatesService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({
      ...Config,
      enableTelemetry: true,
      telemetryExchangeRatesUrl: 'http://example-rates.com',
      telemetryExchangeRatesLifetime: 100,
      openTelemetryCollectors: ['http://example-collector.com']
    })

    appContainer = await createTestApp(deps)
    telemetryService = await deps.use('telemetry')!
    aseRatesService = await deps.use('ratesService')!
    fallbackRatesService = await deps.use('fallbackRatesService')!
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

  it('should return the instance name when calling getInstanceName', () => {
    const serviceName = telemetryService.getInstanceName()

    expect(serviceName).toBe('Rafiki')
  })

  describe('conversion', () => {
    it('should try to convert using aseRatesService and fallback to fallbackRatesService', async () => {
      const aseConvertSpy = jest
        .spyOn(aseRatesService, 'convert')
        .mockImplementation(() =>
          Promise.resolve(ConvertError.InvalidDestinationPrice)
        )

      const fallbackConvertSpy = jest
        .spyOn(fallbackRatesService, 'convert')
        .mockImplementation(() => Promise.resolve(10000n))

      const converted = await telemetryService.convertAmount({
        sourceAmount: 100n,
        sourceAsset: { code: 'USD', scale: 2 }
      })

      expect(aseConvertSpy).toHaveBeenCalled()
      expect(fallbackConvertSpy).toHaveBeenCalled()
      expect(converted).toBe(10000n)
    })
  })
})
