import { Counter, Histogram, MetricOptions, metrics } from '@opentelemetry/api'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import {
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics'

import { ConvertError, RatesService, isConvertError } from '../rates/service'
import { ConvertOptions } from '../rates/util'
import { BaseService } from '../shared/baseService'

export interface TelemetryService {
  shutdown(): void
  getOrCreateMetric(name: string, options?: MetricOptions): Counter
  getOrCreateHistogramMetric(name: string, options?: MetricOptions): Histogram
  getInstanceName(): string | undefined
  getBaseAssetCode(): string
  getBaseScale(): number
  convertAmount(
    convertOptions: Omit<ConvertOptions, 'exchangeRate' | 'destinationAsset'>
  ): Promise<bigint | ConvertError>
}

interface TelemetryServiceDependencies extends BaseService {
  instanceName: string
  collectorUrls: string[]
  exportIntervalMillis?: number
  aseRatesService: RatesService
  internalRatesService: RatesService
  baseAssetCode: string
  baseScale: number
}

const METER_NAME = 'Rafiki'
const SERVICE_NAME = 'RAFIKI_NETWORK'

export function createTelemetryService(
  deps: TelemetryServiceDependencies
): TelemetryService {
  return new TelemetryServiceImpl(deps)
}

class TelemetryServiceImpl implements TelemetryService {
  private instanceName: string
  private meterProvider?: MeterProvider
  private internalRatesService: RatesService
  private aseRatesService: RatesService

  private counters: Map<string, Counter> = new Map()
  private histograms: Map<string, Histogram> = new Map()
  constructor(private deps: TelemetryServiceDependencies) {
    // debug logger:
    // diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
    this.instanceName = deps.instanceName
    this.internalRatesService = deps.internalRatesService
    this.aseRatesService = deps.aseRatesService

    if (deps.collectorUrls.length === 0) {
      deps.logger.info(
        'No collector URLs specified, metrics will not be exported'
      )
      return
    }

    this.meterProvider = new MeterProvider({
      resource: new Resource({ 'service.name': SERVICE_NAME })
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

  public async shutdown(): Promise<void> {
    await this.meterProvider?.shutdown()
  }

  private createHistogram(name: string, options: MetricOptions | undefined) {
    const histogram = metrics
      .getMeter(METER_NAME)
      .createHistogram(name, options)
    this.histograms.set(name, histogram)
    return histogram
  }
  public getOrCreateHistogramMetric(
    name: string,
    options?: MetricOptions
  ): Histogram {
    const existing = this.histograms.get(name)
    if (existing) {
      return existing
    }
    return this.createHistogram(name, options)
  }

  private createCounter(
    name: string,
    options: MetricOptions | undefined
  ): Counter {
    const counter = metrics.getMeter(METER_NAME).createCounter(name, options)
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
    if (isConvertError(converted)) {
      this.deps.logger.error(
        `Unable to convert amount from provided rates: ${converted}`
      )
      converted = await this.internalRatesService.convert({
        ...convertOptions,
        destinationAsset
      })
      if (isConvertError(converted)) {
        this.deps.logger.error(
          `Unable to convert amount from internal rates: ${converted}`
        )
      }
    }
    return converted
  }

  public getInstanceName(): string | undefined {
    return this.instanceName
  }

  getBaseAssetCode(): string {
    return this.deps.baseAssetCode
  }

  getBaseScale(): number {
    return this.deps.baseScale
  }
}
