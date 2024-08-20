# Performance Tests

This package contains a script that will determine the performance of Rafiki by repeatedly making a series of requests to a Rafiki instance to create several kinds of resources (receivers, quotes, outgoing payments).

## Prerequisites

- [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)

  - [Grafana k6](https://grafana.com/docs/k6/latest/) is used to run performance test scripts against Rafiki.

- [Running local playground for Rafiki](../../localenv/README.md)
  - It is recommended to start the local playground with Telemetry running in order to see the impact of a performance test.

If the local environment isn't running it may be started by using the command `pnpm localenv:compose:telemetry:up`.

## Run tests

To run the performance tests (of which there is currently only one):

```
pnpm --filter performance run-tests
```

The test makes a few checks to verify the local playground is running, then runs the k6 binary on the [create-outgoing-payments.js](./scripts/create-outgoing-payments.js) script.

The test can also be run inside of a Docker container on the same Docker network as the Local Playground:

```
pnpm --filter performance run-tests-docker
```
