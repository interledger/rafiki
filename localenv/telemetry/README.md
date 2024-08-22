# Local Playground Telemetry

This folder contains telemetry components that can be run as part of the local playground.

## Overview

The telemetry components include:

- **OpenTelemetry Collector**: Collects and processes telemetry data from `cloud-nine-backend` and `happy-life-backend` services.
- **Prometheus**: Scrapes metrics from the OpenTelemetry collector, and stores them.
- **Tempo**: Ingests traces from the OpenTelemetry collector, and stores them.
- **Grafana**: Visualizes metrics from Prometheus and traces from Tempo.

## Usage

From the root of the repository, run:

```
pnpm localenv:compose:telemetry up
```

If wanting to use Postgres instead of TigerBeetle for the accounting database:

```
pnpm localenv:compose:psql:telemetry up
```

Once the components are running, you can access Grafana at http://localhost:4500. Grafana comes with an example dashboard of some of our basic metrics.
