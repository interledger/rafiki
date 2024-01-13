import {
  Counter,
  DiagConsoleLogger,
  DiagLogLevel,
  MetricOptions,
  diag,
  metrics
} from '@opentelemetry/api'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import {
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics'

import { RatesService } from '../rates/service'
import { BaseService } from '../shared/baseService'

export interface TelemetryService {
  getOrCreate(name: string, options?: MetricOptions): Counter
  getServiceName(): string | undefined
  getRatesService(): RatesService
  getBaseAssetCode(): string
}

interface TelemetryServiceDependencies extends BaseService {
  serviceName: string
  collectorUrls: string[]
  exportIntervalMillis?: number
  telemetryRatesService: RatesService
  baseAssetCode: string
}

export function createTelemetryService(
  deps: TelemetryServiceDependencies
): TelemetryService {
  return new TelemetryServiceImpl(deps)
}

class TelemetryServiceImpl implements TelemetryService {
  private serviceName: string
  private meterProvider?: MeterProvider
  private ratesService: RatesService

  private counters = new Map()
  constructor(private deps: TelemetryServiceDependencies) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
    this.serviceName = deps.serviceName
    this.ratesService = deps.telemetryRatesService

    if (
      deps.collectorUrls &&
      Array.isArray(deps.collectorUrls) &&
      deps.collectorUrls.length === 0
    ) {
      deps.logger.info(
        'No collector URLs specified, metrics will not be exported'
      )
      return
    }

    this.meterProvider = new MeterProvider({
      resource: new Resource({ 'service.name': 'RAFIKI_NETWORK' })
    })

    deps.collectorUrls.forEach((url) => {
      const metricExporter = new OTLPMetricExporter({
        url: url
      })

      const metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: deps.exportIntervalMillis ?? 15000
      })

      this.meterProvider?.addMetricReader(metricReader)
    })

    metrics.setGlobalMeterProvider(this.meterProvider)
  }

  private createCounter(
    name: string,
    options: MetricOptions | undefined
  ): Counter {
    const counter = metrics.getMeter('Rafiki').createCounter(name, options)
    this.counters.set(name, counter)
    return counter
  }

  public getOrCreate(name: string, options?: MetricOptions): Counter {
    const existing = this.counters.get(name)
    if (existing) {
      return existing
    }
    return this.createCounter(name, options)
  }

  public getServiceName(): string | undefined {
    return this.serviceName
  }

  getRatesService(): RatesService {
    return this.ratesService
  }

  getBaseAssetCode(): string {
    return this.deps.baseAssetCode
  }
}
