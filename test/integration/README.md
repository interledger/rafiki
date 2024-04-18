# Integration Tests

This package contains a test environment and suite for our payment flows and api calls.

# Test Environment

The test environment consists of a docker network that includes the `backend` and `auth` services and a shared database for two mock account servicing entities, `cloud-nine-wallet-test` and `happy-life-bank-test`. The test suite is run from the host machine and performs the mock accounting logic and integration server for each of these entities. The tests rely on `mock-account-service-lib` to perfom seeding and business logic in a consistent manner with `mock-account-servicing-entity`.

# Developing Integration tests

Jest logs to standard output and the container logs are available at `./tmp/rafiki_integration_logs.txt`. To speed up the development loop, docker image and internal dependency building can be skipped when running tests by using the --no-build or -nb arguments:

    pnpm --filter run-tests -nb
