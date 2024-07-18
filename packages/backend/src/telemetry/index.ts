import { Config } from '../config/app'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import {
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics'

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { api } from '@opentelemetry/sdk-node'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql'

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import {
  BatchSpanProcessor,
  NodeTracerProvider
} from '@opentelemetry/sdk-trace-node'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'

// debug logger:
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)

const SERVICE_NAME = 'RAFIKI_NETWORK'
const rafikiResource = new Resource({
  'service.name': SERVICE_NAME,
  instance: Config.instanceName
})

const meterReaders = []

if (Config.enableTelemetry) {
  for (const url of Config.openTelemetryCollectors) {
    const metricExporter = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url
      }),
      exportIntervalMillis: Config.openTelemetryExportInterval ?? 15000
    })

    meterReaders.push(metricExporter)
  }
}

const meterProvider = new MeterProvider({
  resource: rafikiResource,
  readers: meterReaders
})

api.metrics.setGlobalMeterProvider(meterProvider)

const tracerProvider = new NodeTracerProvider({
  resource: rafikiResource
})

if (Config.enableTelemetryTraces) {
  for (const url of Config.openTelemetryTraceCollectorUrls) {
    const traceExporter = new OTLPTraceExporter({
      url
    })

    tracerProvider.addSpanProcessor(new BatchSpanProcessor(traceExporter))
  }
}

tracerProvider.register()

registerInstrumentations({
  tracerProvider,
  meterProvider,
  instrumentations: [
    new UndiciInstrumentation(),
    new HttpInstrumentation(),
    new PgInstrumentation(),
    new GraphQLInstrumentation({
      mergeItems: true,
      ignoreTrivialResolveSpans: true,
      ignoreResolveSpans: true
    })
  ]
})
