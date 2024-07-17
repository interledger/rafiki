import { Counter, Histogram, MetricOptions, metrics } from '@opentelemetry/api'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import {
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics'

import { RatesService, isConvertError } from '../rates/service'
import { ConvertOptions } from '../rates/util'
import { BaseService } from '../shared/baseService'
import { privacy } from './privacy'

export interface TelemetryService {
  shutdown(): Promise<void>
  incrementCounter(
    name: string,
    value: number,
    attributes?: Record<string, unknown>
  ): void
  incrementCounterWithTransactionAmount(
    name: string,
    amount: { value: bigint; assetCode: string; assetScale: number },
    attributes?: Record<string, unknown>
  ): Promise<void>
  recordHistogram(
    name: string,
    value: number,
    attributes?: Record<string, unknown>
  ): void
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

    this.meterProvider = new MeterProvider({
      resource: new Resource({ 'service.name': SERVICE_NAME }),
      readers: deps.collectorUrls.map((url) => {
        return new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url
          }),
          exportIntervalMillis: deps.exportIntervalMillis ?? 15000
        })
      })
    })

    metrics.setGlobalMeterProvider(this.meterProvider)
  }

  public async shutdown(): Promise<void> {
    await this.meterProvider?.shutdown()
  }

  private getOrCreateCounter(name: string, options?: MetricOptions): Counter {
    let counter = this.counters.get(name)
    if (!counter) {
      counter = metrics.getMeter(METER_NAME).createCounter(name, options)
      this.counters.set(name, counter)
    }
    return counter
  }

  private getOrCreateHistogram(
    name: string,
    options?: MetricOptions
  ): Histogram {
    let histogram = this.histograms.get(name)
    if (!histogram) {
      histogram = metrics.getMeter(METER_NAME).createHistogram(name, options)
      this.histograms.set(name, histogram)
    }
    return histogram
  }

  public incrementCounter(
    name: string,
    amount: number,
    attributes: Record<string, unknown> = {}
  ): void {
    const counter = this.getOrCreateCounter(name)
    counter.add(amount, {
      source: this.instanceName,
      ...attributes
    })
  }

  public async incrementCounterWithTransactionAmount(
    name: string,
    amount: { value: bigint; assetCode: string; assetScale: number },
    attributes: Record<string, unknown> = {}
  ): Promise<void> {
    const { value, assetCode, assetScale } = amount
    try {
      const converted = await this.convertAmount({
        sourceAmount: value,
        sourceAsset: { code: assetCode, scale: assetScale }
      })
      if (isConvertError(converted)) {
        this.deps.logger.error(`Unable to convert amount: ${converted}`)
        return
      }

      const obfuscatedAmount = privacy.applyPrivacy(Number(converted))
      this.incrementCounter(name, obfuscatedAmount, attributes)
    } catch (e) {
      this.deps.logger.error(e, `Unable to collect telemetry`)
    }
  }

  public recordHistogram(
    name: string,
    value: number,
    attributes: Record<string, unknown> = {}
  ): void {
    const histogram = this.getOrCreateHistogram(name)
    histogram.record(value, {
      source: this.instanceName,
      ...attributes
    })
  }

  private async convertAmount(
    convertOptions: Pick<ConvertOptions, 'sourceAmount' | 'sourceAsset'>
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
}
