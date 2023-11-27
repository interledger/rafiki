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

import { BaseService } from '../shared/baseService'

export interface TelemetryService {
  getOrCreate(name: string, options?: MetricOptions): Counter
  getServiceName(): string | undefined
}

interface TelemetryServiceDependencies extends BaseService {
  serviceName: string
  collectorUrl?: string
  exportIntervalMillis?: number
}

export function createTelemetryService(
  deps: TelemetryServiceDependencies
): TelemetryService {
  return new TelemetryServiceImpl(deps)
}

class TelemetryServiceImpl implements TelemetryService {
  private serviceName: string

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
}
