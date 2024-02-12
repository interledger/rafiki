---
title: Deploying Custom Telemetry Service
---

Rafiki allows for integrating [Account Servicing Entities](/reference/glossary#account-servicing-entity) (ASE) to build their own telemetry solution based on the [OpenTelemetry](https://opentelemetry.io/) standardized metrics format that Rafiki exposes.

In order to do so, the integrating ASE must deploy its own OpenTelemetry collector that should act as a sidecar container to Rafiki. It needs to provide the OpenTelemetry collector's ingest endpoint so that Rafiki can start sending metrics to it.

## Rafiki Telemetry Environment Variables

- `ENABLE_TELEMETRY`: boolean, defaults to `true`. Enables the telemetry service on Rafiki.
- `OPEN_TELEMETRY_COLLECTOR_URL`: CSV of URLs for Open Telemetry collectors (e.g., `http://otel-collector-NLB-e3172ff9d2f4bc8a.elb.eu-west-2.amazonaws.com:4317,http://happy-life-otel-collector:4317`).
- `OPEN_TELEMETRY_EXPORT_INTERVAL`: number in milliseconds, defaults to `15000`. Defines how often the instrumented Rafiki instance should send metrics.
- `TELEMETRY_EXCHANGE_RATES_URL`: string URL, defaults to `https://telemetry-exchange-rates.s3.amazonaws.com/exchange-rates-usd.json`. It defines the endpoint that Rafiki will query for exchange rates, as a fallback when ASE does not [provide them](/integration/getting-started/#exchange-rates). If set, the response format of the external exchange rates API should be of type Rates, as the rates service expects.
  The default endpoint set here points to a public S3 that has the previously mentioned required format, updated daily.

## Example Docker OpenTelemetry Collector Image and Configuration

Example of Docker OpenTelemetry Collector image and configuration that integrates with Rafiki and sends data to a Prometheus remote write endpoint:

(it can be tested in our [Local Playground](/playground/overview) setup, by also providing the environment variables listed above to happy-life-backend in the [docker-compose](https://github.com/interledger/rafiki/blob/main/localenv/happy-life-bank/docker-compose.yml))

#### Docker-compose config:

```yaml
#Serves as example for optional local collector configuration
happy-life-otel-collector:
  image: otel/opentelemetry-collector-contrib:latest
  command: ['--config=/etc/otel-collector-config.yaml', '']
  environment:
    - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID-''}
    - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY-''}
  volumes:
    - ../collector/otel-collector-config.yaml:/etc/otel-collector-config.yaml
  networks:
    - rafiki
  expose:
    - 4317
  ports:
    - '13132:13133' # health_check extension
```

#### OpenTelemetry OTEL collector config:

[OTEL Collector config docs](https://opentelemetry.io/docs/collector/configuration/)

```yaml
# Serves as example for the configuration of a local OpenTelemetry Collector that sends metrics to an AWS Managed Prometheus Workspace
# Sigv4auth required for AWS Prometheus Remote Write access (USER with access keys needed)

extensions:
  sigv4auth:
    assume_role:
      arn: 'arn:aws:iam::YOUR-ROLE:role/PrometheusRemoteWrite'
      sts_region: 'YOUR-REGION'

receivers:
  otlp:
    protocols:
      grpc:
      http:
        cors:
          allowed*origins:
            - http://*
            - https://\_

processors:
  batch:

exporters:
  logging:
    verbosity: 'normal'
  prometheusremotewrite:
    endpoint: 'https://aps-workspaces.YOUR-REGION.amazonaws.com/workspaces/ws-YOUR-WORKSPACE-IDENTIFIER/api/v1/remote_write'
    auth:
      authenticator: sigv4auth

service:
  telemetry:
    logs:
      level: 'debug'
    metrics:
      level: 'detailed'
      address: 0.0.0.0:8888
  extensions: [sigv4auth]
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging, prometheusremotewrite]
```
