import {
  Counter,
  DiagConsoleLogger,
  DiagLogLevel,
  MetricOptions,
  ValueType,
  diag,
  metrics
} from '@opentelemetry/api'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import {
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics'

import { BaseService } from '../shared/baseService'
import { IlpObservabilityParameters } from '../payment-method/ilp/connector/core'

export interface TelemetryService {
  getCounter(name: string): Counter | undefined
  getServiceName(): string | undefined
  collectTransactionsAmountMetric(params: IlpObservabilityParameters): void
  collectTransactionCountMetric(assetCode?: string): void
}

interface TelemetryServiceDependencies extends BaseService {
  serviceName?: string
  collectorUrl?: string
  exportIntervalMillis?: number
}

export enum Metrics {
  TRANSACTIONS_TOTAL = 'transactions_total',
  TRANSACTIONS_AMOUNT = 'transactions_amount'
}

export function createTelemetryService(
  deps: TelemetryServiceDependencies
): TelemetryService {
  return new TelemetryServiceImpl(deps)
}

class TelemetryServiceImpl implements TelemetryService {
  private serviceName: string | undefined

  private counters = new Map()
  constructor(private deps: TelemetryServiceDependencies) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)
    this.serviceName = deps.serviceName
    console.log(
      `serviceName: ${deps.serviceName}, collectorUrl: ${deps.collectorUrl} }`
    )

    const meterProvider = new MeterProvider({
      resource: new Resource({ 'service.name': 'RAFIKI_NETWORK' })
    })

    const metricExporter = new OTLPMetricExporter({
      url: deps.collectorUrl ?? 'http://otel-collector:4317'
    })

    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: deps.exportIntervalMillis ?? 60000
    })

    meterProvider.addMetricReader(metricReader)

    metrics.setGlobalMeterProvider(meterProvider)

    //* init counters
    this.createCounter(Metrics.TRANSACTIONS_TOTAL, {
      description: 'Count of funded transactions'
    })

    this.createCounter(Metrics.TRANSACTIONS_AMOUNT, {
      description:
        'Amount sent through the network. Asset Code & Asset Scale are sent as attributes',
      valueType: ValueType.DOUBLE
    })
  }

  private createCounter(
    name: string,
    options: MetricOptions | undefined
  ): void {
    const counter = metrics.getMeter('Rafiki').createCounter(name, options)
    this.counters.set(name, counter)
  }

  public getCounter(name: string): Counter | undefined {
    return this.counters.get(name)
  }

  public getServiceName(): string | undefined {
    return this.serviceName
  }

  public collectTransactionsAmountMetric(
    params: IlpObservabilityParameters
  ): void {
    const { asset, amount, unfulfillable } = params

    if (unfulfillable || !amount) {
      //can collect metrics such as count of unfulfillable packets here
      return
    }

    console.log(
      `######################## [TELEMETRY]Gathering Transaction Amount Metric............`
    )

    const scalingFactor = asset.scale
      ? Math.pow(10, 4 - asset.scale)
      : undefined
    console.log(
      `scaling factor is: Math.pow(10 , 4 - ${asset.scale}) === ${scalingFactor}`
    )

    const totalReceivedInAssetScale4 = Number(amount) * Number(scalingFactor)

    console.log(
      `totalReceivedInAssetScale4 (${totalReceivedInAssetScale4}) =   totalReceived(${amount}) * scalingFactor(${scalingFactor})`
    )

    this?.getCounter(Metrics.TRANSACTIONS_AMOUNT)?.add(
      totalReceivedInAssetScale4,
      {
        asset_code: asset.code,
        source: this.getServiceName() ?? 'Rafiki'
      }
    )

    console.log(
      '######################## [TELEMETRY] Transaction Amount  Metric Collected ####################'
    )
  }

  public collectTransactionCountMetric(assetCode?: string): void {
    console.log(
      `######################## [TELEMETRY]Gathering Transaction Count Metric..........`
    )

    this.getCounter(Metrics.TRANSACTIONS_TOTAL)?.add(1, {
      source: this.getServiceName() ?? 'Rafiki',
      asset_code: assetCode
    })

    console.log(
      '######################## [TELEMETRY] Transaction Count  Metric Collected ####################'
    )
  }
}
