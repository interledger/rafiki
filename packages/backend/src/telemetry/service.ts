import {
  Counter,
  Histogram,
  MetricOptions,
  Tracer,
  metrics,
  trace
} from '@opentelemetry/api'
import { MeterProvider } from '@opentelemetry/sdk-metrics'

import { ConvertError, RatesService, isConvertError } from '../rates/service'
import { ConvertOptions } from '../rates/util'
import { BaseService } from '../shared/baseService'

export interface TelemetryService {
  shutdown(): void
  getOrCreateMetric(name: string, options?: MetricOptions): Counter
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

  private counters = new Map()
  constructor(private deps: TelemetryServiceDependencies) {
    this.instanceName = deps.instanceName
    this.internalRatesService = deps.internalRatesService
    this.aseRatesService = deps.aseRatesService
  }

  public async shutdown(): Promise<void> {
    await this.meterProvider?.shutdown()
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
