# Performance Tests

This package contains a script that will determine the performance of Rafiki by repeatedly making a series of requests to a Rafiki instance to create several kinds of resources (receivers, quotes, outgoing payments).

## Prerequisites

- [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (required if not running with Docker)

  - [Grafana k6](https://grafana.com/docs/k6/latest/) is used to run performance test scripts against Rafiki.

- **Environment**

  It is recommended to start the local playground with Telemetry running in order to see the impact of a performance test.

  A local Rafiki playground may be started using the instructions in [Running local playground for Rafiki](../../localenv/README.md).

  If the local environment isn't running, it may be started with:

  ```sh
  pnpm localenv:compose:telemetry up
  ```

  Alternatively, tests can be run against the test environment. This requires starting the environment:

  ```sh
  pnpm --filter performance testenv:compose up
  ```

  and a process for the Mock Account Servicing Entities:

  ```sh
  pnpm --filter performance start-mases
  ```

## Run Tests

The performance script relies on a node module which must be bundled before running:

```sh
pnpm --filter performance bundle
```

### Running Against Local Environment

To run the performance tests against a locally running Rafiki instance:

```sh
pnpm --filter performance run-tests
```

The test makes a few checks to verify the local playground is running, then runs the k6 binary on the [create-outgoing-payments.js](./scripts/create-outgoing-payments.js) script.

Alternatively, the test can be run inside a Docker container on the same Docker network as the Local Playground:

```sh
pnpm --filter performance run-tests-docker
```

### Running Against Test Environment

To run the performance tests against the test environment:

```sh
pnpm --filter performance run-tests:testenv
```

Or using Docker:

```sh
pnpm --filter performance run-tests-docker:testenv
```

### Overriding k6 Arguments

k6 test options can be overridden by passing arguments after `--k6args`, or `-k`. For example, to set the number of virtual users to 5 and duration to 1 minute:

```sh
pnpm --filter performance run-tests:testenv -k --vus 5 --duration 1m
```
