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
  getTelemetryRatesService(): RatesService // Add this line
  getBaseAssetCode(): string
  applyPrivacy(rawValue: number): number
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
  private maxBucketSize: number = 10000000
  private minBucketSize: number = 2500

  private counters = new Map()
  constructor(private deps: TelemetryServiceDependencies) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
    this.serviceName = deps.serviceName

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

  getTelemetryRatesService(): RatesService {
    return this.deps.telemetryRatesService
  }

  getBaseAssetCode(): string {
    return this.deps.baseAssetCode
  }

  private generateLaplaceNoise(scale: number): number {
    const u = Math.random() - 0.5
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u))
  }

  private computePrivacyParameter(sensitivity: number): number {
    return sensitivity * 0.1
  }

  private getBucketSize(rawValue: number): number {
    const base = 2
    const scale = 5000
    //when this is reached, switch from linear to logarithmic bucket sizing
    const threshold = 20000

    let bucketSize
    if (rawValue < threshold) {
      bucketSize = Math.round(rawValue / scale) * scale
    } else {
      bucketSize =
        Math.pow(base, Math.ceil(Math.log(rawValue / scale) / Math.log(base))) *
        scale
    }

    const minBucketSize = this.minBucketSize
    const maxBucketSize = this.maxBucketSize

    return Math.max(minBucketSize, Math.min(bucketSize, maxBucketSize))
  }

  private roundValue(rawValue: number, bucketSize: number): number {
    rawValue = Math.min(rawValue, this.maxBucketSize)
    const lowerBound = Math.floor(rawValue / bucketSize) * bucketSize
    const upperBound = Math.ceil(rawValue / bucketSize) * bucketSize
    const median = (lowerBound + upperBound) / 2
    const roundedValue = rawValue <= median ? lowerBound : upperBound
    return Math.max(roundedValue, bucketSize / 2)
  }

  public applyPrivacy(rawValue: number): number {
    const bucketSize = this.getBucketSize(rawValue)
    let roundedValue = this.roundValue(rawValue, bucketSize)
    const privacyParameter = this.computePrivacyParameter(
      Math.max(roundedValue / 10, bucketSize)
    )
    const laplaceNoise = this.generateLaplaceNoise(privacyParameter)
    roundedValue += Math.round(laplaceNoise)
    if (roundedValue === 0) {
      roundedValue = bucketSize / 2
    }
    return roundedValue
  }
}
