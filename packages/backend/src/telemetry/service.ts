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

import { ConvertError, RatesService } from '../rates/service'
import { ConvertOptions } from '../rates/util'
import { BaseService } from '../shared/baseService'

export interface TelemetryService {
  getOrCreateMetric(name: string, options?: MetricOptions): Counter
  getServiceName(): string | undefined
  getBaseAssetCode(): string
  getBaseScale(): number
  convertAmount(
    convertOptions: Omit<ConvertOptions, 'exchangeRate' | 'destinationAsset'>
  ): Promise<bigint | ConvertError>
}

interface TelemetryServiceDependencies extends BaseService {
  serviceName: string
  collectorUrls: string[]
  exportIntervalMillis?: number
  aseRatesService: RatesService
  fallbackRatesService: RatesService
  baseAssetCode: string
  baseScale: number
}

export function createTelemetryService(
  deps: TelemetryServiceDependencies
): TelemetryService {
  return new TelemetryServiceImpl(deps)
}

class TelemetryServiceImpl implements TelemetryService {
  private serviceName: string
  private meterProvider?: MeterProvider
  private fallbackRatesService: RatesService
  private aseRatesService: RatesService

  private counters = new Map()
  constructor(private deps: TelemetryServiceDependencies) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
    this.serviceName = deps.serviceName
    this.fallbackRatesService = deps.fallbackRatesService
    this.aseRatesService = deps.aseRatesService

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

  public getOrCreateMetric(name: string, options?: MetricOptions): Counter {
    const existing = this.counters.get(name)
    if (existing) {
      return existing
    }
    return this.createCounter(name, options)
  }

  public async convertAmount(
    convertOptions: Omit<ConvertOptions, 'exchangeRate'>
  ) {
    const destinationAsset = {
      code: this.deps.baseAssetCode,
      scale: this.deps.baseScale
    }

    let converted = await this.aseRatesService.convert({
      ...convertOptions,
      destinationAsset
    })
    if (typeof converted !== 'bigint' && converted in ConvertError) {
      this.deps.logger.error(
        `Unable to convert amount from provided rates: ${converted}`
      )
      converted = await this.fallbackRatesService.convert({
        ...convertOptions,
        destinationAsset
      })
      if (typeof converted !== 'bigint' && converted in ConvertError) {
        this.deps.logger.error(
          `Unable to convert amount from fallback rates: ${converted}`
        )
      }
    }
    return converted
  }

  public getServiceName(): string | undefined {
    return this.serviceName
  }

  getBaseAssetCode(): string {
    return this.deps.baseAssetCode
  }

  getBaseScale(): number {
    return this.deps.baseScale
  }
}
