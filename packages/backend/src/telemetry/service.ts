import { Counter, Histogram, MetricOptions, metrics } from '@opentelemetry/api'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import { RatesService, isConvertError } from '../rates/service'
import { ConvertSourceOptions } from '../rates/util'
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
    tenantId?: string,
    attributes?: Record<string, unknown>,
    preservePrivacy?: boolean
  ): Promise<void>
  incrementCounterWithTransactionAmountDifference(
    name: string,
    amountSource: { value: bigint; assetCode: string; assetScale: number },
    amountDestination: { value: bigint; assetCode: string; assetScale: number },
    tenantId?: string,
    attributes?: Record<string, unknown>
  ): Promise<void>
  recordHistogram(
    name: string,
    value: number,
    attributes?: Record<string, unknown>
  ): void
  startTimer(
    name: string,
    attributes?: Record<string, unknown>
  ): (additionalAttributes?: Record<string, unknown>) => void
}

export interface TelemetryServiceDependencies extends BaseService {
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

export function createNoopTelemetryService(): TelemetryService {
  return new NoopTelemetryServiceImpl()
}

export class TelemetryServiceImpl implements TelemetryService {
  private instanceName: string
  private meterProvider?: MeterProvider
  private internalRatesService: RatesService
  private aseRatesService: RatesService

  private counters: Map<string, Counter> = new Map()
  private histograms: Map<string, Histogram> = new Map()
  constructor(private deps: TelemetryServiceDependencies) {
    this.instanceName = deps.instanceName
    this.internalRatesService = deps.internalRatesService
    this.aseRatesService = deps.aseRatesService
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

  public async incrementCounterWithTransactionAmountDifference(
    name: string,
    amountSource: { value: bigint; assetCode: string; assetScale: number },
    amountDestination: { value: bigint; assetCode: string; assetScale: number },
    tenantId?: string,
    attributes: Record<string, unknown> = {}
  ): Promise<void> {
    if (!amountSource.value || !amountDestination.value) return

    const convertedSource = await this.convertAmount(
      {
        sourceAmount: amountSource.value,
        sourceAsset: {
          code: amountSource.assetCode,
          scale: amountSource.assetScale
        }
      },
      tenantId
    )
    if (isConvertError(convertedSource)) {
      this.deps.logger.error(
        `Unable to convert source amount: ${convertedSource}`
      )
      return
    }
    const convertedDestination = await this.convertAmount(
      {
        sourceAmount: amountDestination.value,
        sourceAsset: {
          code: amountDestination.assetCode,
          scale: amountDestination.assetScale
        }
      },
      tenantId
    )
    if (isConvertError(convertedDestination)) {
      this.deps.logger.error(
        `Unable to convert destination amount: ${convertedSource}`
      )
      return
    }

    const diff = BigInt(convertedSource.amount - convertedDestination.amount)
    if (diff === 0n) return

    if (diff < 0n) {
      this.deps.logger.error(
        `Difference should not be negative!: ${diff}, source asset ${amountSource.assetCode} vs destination asset ${amountDestination.assetCode}.`
      )
      return
    }
    this.incrementCounter(name, Number(diff), attributes)
  }

  public async incrementCounterWithTransactionAmount(
    name: string,
    amount: { value: bigint; assetCode: string; assetScale: number },
    tenantId?: string,
    attributes: Record<string, unknown> = {},
    preservePrivacy = true
  ): Promise<void> {
    const { value, assetCode, assetScale } = amount
    try {
      const converted = await this.convertAmount(
        {
          sourceAmount: value,
          sourceAsset: { code: assetCode, scale: assetScale }
        },
        tenantId
      )
      if (isConvertError(converted)) {
        this.deps.logger.error(`Unable to convert amount: ${converted}`)
        return
      }

      const finalAmount = preservePrivacy
        ? privacy.applyPrivacy(Number(converted.amount))
        : Number(converted.amount)
      this.incrementCounter(name, finalAmount, attributes)
    } catch (e) {
      this.deps.logger.error(e, 'Unable to collect telemetry')
    }
  }

  public recordHistogram(
    name: string,
    value: number,
    attributes?: Record<string, unknown>
  ): void {
    const histogram = this.getOrCreateHistogram(name)
    histogram.record(value, {
      source: this.instanceName,
      ...attributes
    })
  }

  private async convertAmount(
    convertOptions: Pick<ConvertSourceOptions, 'sourceAmount' | 'sourceAsset'>,
    tenantId?: string
  ) {
    const destinationAsset = {
      code: this.deps.baseAssetCode,
      scale: this.deps.baseScale
    }

    let converted = await this.aseRatesService.convertSource(
      {
        ...convertOptions,
        destinationAsset
      },
      tenantId
    )
    if (isConvertError(converted)) {
      this.deps.logger.error(
        `Unable to convert amount from provided rates: ${converted}`
      )
      converted = await this.internalRatesService.convertSource({
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

  public startTimer(
    name: string,
    attributes: Record<string, unknown> = {}
  ): (additionalAttributes?: Record<string, unknown>) => void {
    const start = Date.now()
    return (additionalAttributes: Record<string, unknown> = {}) => {
      const mergedAttributes = { ...attributes, ...additionalAttributes }
      this.recordHistogram(name, Date.now() - start, mergedAttributes)
    }
  }
}

/* eslint-disable @typescript-eslint/no-unused-vars */
export class NoopTelemetryServiceImpl implements TelemetryService {
  constructor() {}

  public async shutdown(): Promise<void> {
    // do nothing
  }

  public incrementCounter(
    name: string,
    value: number,
    attributes?: Record<string, unknown>
  ): void {
    // do nothing
  }

  public recordHistogram(
    name: string,
    value: number,
    attributes?: Record<string, unknown>
  ): void {
    // do nothing
  }

  public async incrementCounterWithTransactionAmountDifference(
    name: string,
    amountSource: { value: bigint; assetCode: string; assetScale: number },
    amountDestination: { value: bigint; assetCode: string; assetScale: number },
    tenantId?: string,
    attributes?: Record<string, unknown>
  ): Promise<void> {
    // do nothing
  }

  public async incrementCounterWithTransactionAmount(
    name: string,
    amount: { value: bigint; assetCode: string; assetScale: number },
    tenantId?: string,
    attributes: Record<string, unknown> = {},
    preservePrivacy = true
  ): Promise<void> {
    // do nothing
  }

  public startTimer(
    name: string,
    attributes: Record<string, unknown> = {}
  ): (additionalAttributes?: Record<string, unknown>) => void {
    return (additionalAttributes?: Record<string, unknown>) => {
      // do nothing
    }
  }
}
