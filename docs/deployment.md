# Deploying Rafiki

The production environment consists of

- `backend`
- (optional but recommended) `auth`
- (optional but recommended) `frontend`

and the databases

- TigerBeetle or Postgres (accounting)
- Postgres (Open Payments resources, auth resources)
- Redis (STREAM details)

To integrate Rafiki with your own services, view the [integration documentation](./integration.md).

### Running the production environment

Dependencies:

- [Kubernetes](https://kubernetes.io/releases/download/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/#kubectl)
- [helm](https://helm.sh/docs/intro/install/)

Rafiki cannot be run by itself but needs at least a Postgres and a Redis instance running with it. If you prefer to use Tigerbeetle instead of Postgres for accounting, a Tigerbeetle instance is required as well.

An example Chart including Rafiki, Postgres, and Redis can be found [here](../infrastructure/helm/rafiki-example/).

<!-- TODO: add chart to packages -->

<!-- To add the Rafiki chart, run

```
// add rafiki repository
$ helm repo add ...

``` -->

#### Parameters

| Name                                    | Corresponding Environment Variable or Description |
| --------------------------------------- | ------------------------------------------------- |
| auth.postgresql.host                    | Postgres host                                     |
| auth.postgresql.port                    | Postgres port                                     |
| auth.postgresql.username                | Postgres user name                                |
| auth.postgresql.database                | Postgres database name                            |
| auth.postgresql.password                | Postgres user password                            |
| auth.port.admin                         | `ADMIN_PORT`                                      |
| auth.port.auth                          | `AUTH_PORT`                                       |
| auth.port.introspection                 | `INTROSPECTION_PORT`                              |
| auth.identityServer.domain              | `IDENTITY_SERVER_DOMAIN`                          |
| auth.identityServer.secret              | `IDENTITY_SERVER_SECRET`                          |
| auth.interaction.incomingPayment        | `INCOMING_PAYMENT_INTERACTION`                    |
| auth.interaction.quote                  | `QUOTE_INTERACTION`                               |
| auth.grant.waitSeconds                  | `WAIT_SECONDS`                                    |
| auth.accessToken.deletionDays           | `ACCESS_TOKEN_DELETION_DAYS`                      |
| auth.accessToken.expirySeconds          | `ACCESS_TOKEN_EXPIRY_SECONDS`                     |
| auth.cookieKey                          | `COOKIE_KEY`                                      |
| auth.workers.cleanup                    | `DATABASE_CLEANUP_WORKERS`                        |
| backend.nodeEnv                         | `NODE_ENV`                                        |
| backend.logLevel                        | `LOG_LEVEL`                                       |
| backend.serviceUrls.PUBLIC_HOST         | `PUBLIC_HOST`                                     |
| backend.serviceUrls.OPEN_PAYMENTS_URL   | `OPEN_PAYMENTS_URL`                               |
| backend.serviceUrls.PAYMENT_POINTER_URL | `PAYMENT_POINTER_URL`                             |
| backend.serviceUrls.WEBHOOK_URL         | `WEBHOOK_URL`                                     |
| backend.serviceUrls.EXCHANGE_RATES_URL  | `EXCHANGE_RATES_URL`                              |
| backend.serviceUrls.QUOTE_URL           | `QUOTE_URL`                                       |
| backend.redis.host                      | Redis host                                        |
| backend.redis.port                      | Redis port                                        |
| backend.redis.tlsCaFile                 | `REDIS_TLS_CA_FILE_PATH`                          |
| backend.redis.tlsCertFile               | `REDIS_TLS_CERT_FILE_PATH`                        |
| backend.redis.tlsKeyFile                | `REDIS_TLS_KEY_FILE_PATH`                         |
| backend.postgresql.host                 | Postgres host                                     |
| backend.postgresql.port                 | Postgres port                                     |
| backend.postgresql.username             | Postgres user name                                |
| backend.postgresql.database             | Postgres database name                            |
| backend.postgresql.password             | Postgres user password                            |
| backend.port.admin                      | `ADMIN_PORT`                                      |
| backend.port.connector                  | `CONNECTOR_PORT`                                  |
| backend.port.openPayments               | `OPEN_PAYMENTS_PORT`                              |
| backend.ilp.address                     | `ILP_ADDRESS`                                     |
| backend.ilp.streamSecret                | `STREAM_SECRET`                                   |
| backend.ilp.slippage                    | `SLIPPAGE`                                        |
| backend.key.id                          | `KEY_ID`                                          |
| backend.key.file                        | `PRIVATE_KEY_FILE`                                |
| backend.quoteSignatureSecret            | `SIGNATURE_SECRET`                                |
| backend.withdrawalThrottleDelay         | `WITHDRAWAL_THROTTLE_DELAY`                       |
| backend.lifetime.exchangeRate           | `EXCHANGE_RATES_LIFETIME`                         |
| backend.lifetime.quote                  | `QUOTE_LIFESPAN`                                  |
| backend.lifetime.webhook                | `WEBHOOK_TIMEOUT`                                 |
| backend.workers.incomingPayment         | `INCOMING_PAYMENT_WORKERS`                        |
| backend.workers.outgoingPayment         | `OUTGOING_PAYMENT_WORKERS`                        |
| backend.workers.paymentPointer          | `PAYMENT_POINTER_WORKERS`                         |
| backend.workers.webhook                 | `WEBHOOK_WORKERS`                                 |
| backend.workerIdle                      | worker idle time in milliseconds                  |
| frontend.port                           | `PORT`                                            |

### Environment Variables

#### Backend

| Variable                        | Default                                                     | Description                                                              |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ADMIN_PORT`                    | `3001`                                                      | GraphQL Server port                                                      |
| `AUTH_SERVER_GRANT_URL`         | `http://127.0.0.1:3006`                                     | endpoint to on the Open Payments Auth Server to request a grant          |
| `AUTH_SERVER_INTROSPECTION_URL` | `http://127.0.0.1:3007`                                     | endpoint to on the Open Payments Auth Server to introspect an auth token |
| `CONNECTOR_PORT`                | `3002`                                                      | STREAM/ILP connector port                                                |
| `DATABASE_URL`                  | `postgresql://postgres:password@localhost:5432/development` | Postgres database URL                                                    |
| `EXCHANGE_RATES_LIFETIME`       | `15_000`                                                    | milliseconds                                                             |
| `EXCHANGE_RATES_URL`            | `undefined`                                                 | endpoint on the Account Servicing Entity to request receiver fees        |
| `ILP_ADDRESS`                   | `test.rafiki`                                               | ILP address of this Rafiki instance                                      |
| `INCOMING_PAYMENT_WORKERS`      | `1`                                                         | number of workers processing incoming payment requests                   |
| `INCOMING_PAYMENT_WORKER_IDLE`  | `200`                                                       | milliseconds                                                             |
| `KEY_ID`                        | `rafiki`                                                    | Rafiki instance client key id                                            |
| `LOG_LEVEL`                     | `info`                                                      | [Pino Log Level](https://getpino.io/#/docs/api?id=levels)                |
| `NODE_ENV`                      | `development`                                               | node environment, `development`, `test`, or `production`                 |
| `OPEN_PAYMENTS_PORT`            | `3003`                                                      | Open Payments APIs port                                                  |
| `OPEN_PAYMENTS_URL`             | `http://127.0.0.1:3003`                                     | Open Payments APIs base URL                                              |
| `OUTGOING_PAYMENT_WORKERS`      | `4`                                                         | number of workers processing outgoing payment requests                   |
| `OUTGOING_PAYMENT_WORKER_IDLE`  | `200`                                                       | milliseconds                                                             |
| `PAYMENT_POINTER_URL`           | `http://127.0.0.1:3001/.well-known/pay`                     | Rafiki instance internal payment pointer                                 |
| `PAYMENT_POINTER_WORKERS`       | `1`                                                         | number of workers processing payment pointer requests                    |
| `PAYMENT_POINTER_WORKER_IDLE`   | `200`                                                       | milliseconds                                                             |
| `PRIVATE_KEY_FILE`              | `undefined`                                                 | Rafiki instance client private key                                       |
| `PUBLIC_HOST`                   | `http://127.0.0.1:3001`                                     | (testing) public Host for Open Payments APIs                             |
| `QUOTE_LIFESPAN`                | `5 * 60_000`                                                | milliseconds                                                             |
| `QUOTE_URL`                     | `http://127.0.0.1:4001/quote`                               | endpoint on the Account Servicing Entity to request sender fees          |
| `REDIS_TLS_CA_FILE_PATH`        | `''`                                                        | Redis TLS info                                                           |
| `REDIS_TLS_CERT_FILE_PATH`      | `''`                                                        | Redis TLS info                                                           |
| `REDIS_TLS_KEY_FILE_PATH`       | `''`                                                        | Redis TLS info                                                           |
| `REDIS_URL`                     | `redis://127.0.0.1:6379`                                    | Redis database URL                                                       |
| `SIGNATURE_SECRET`              | `undefined`                                                 | to generate quote signatures                                             |
| `SIGNATURE_VERSION`             | `1`                                                         | to generate quote signatures                                             |
| `SLIPPAGE`                      | `0.01`                                                      | accepted quote fluctuation, default 1%                                   |
| `STREAM_SECRET`                 | 32 random bytes                                             | seed secret to generate connection secrets                               |
| `TIGERBEETLE_CLUSTER_ID`        | `0`                                                         | TigerBeetle cluster id                                                   |
| `TIGERBEETLE_REPLICA_ADDRESSES` | `3004`                                                      | comma separated IP addresses/ports                                       |
| `USE_TIGERBEETLE`               | `false`                                                     | flag - use TigerBeetle or Postgres for accounting                        |
| `WEBHOOK_TIMEOUT`               | `2000`                                                      | milliseconds                                                             |
| `WEBHOOK_URL`                   | `http://127.0.0.1:4001/webhook`                             | endpoint on the Account Servicing Entity that consumes webhook events    |
| `WEBHOOK_WORKERS`               | `1`                                                         | number of workers processing webhook requests                            |
| `WEBHOOK_WORKER_IDLE`           | `200`                                                       | milliseconds                                                             |
| `WITHDRAWAL_THROTTLE_DELAY`     | `undefined`                                                 | delay in withdrawal processing                                           |

#### Auth

| Variable                       | Default                                                          | Description                                                                |
| ------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ACCESS_TOKEN_DELETION_DAYS`   | `30`                                                             | days until expired or revoked access tokens are deleted                    |
| `ACCESS_TOKEN_EXPIRY_SECONDS`  | `10 * 60`                                                        | expiry time for access tokens (default: 10 minutes)                        |
| `ADMIN_PORT`                   | `3003`                                                           | GraphQL Server port                                                        |
| `AUTH_DATABASE_URL`            | `postgresql://postgres:password@localhost:5432/auth_development` | Postgres database URL                                                      |
| `AUTH_PORT`                    | `3006`                                                           | port of this Open Payments Auth Server                                     |
| `AUTH_SERVER_DOMAIN`           | `http://localhost:3006`                                          | endpoint of this Open Payments Auth Server                                 |
| `COOKIE_KEY`                   | 32 random bytes                                                  | signed cookie key                                                          |
| `DATABASE_CLEANUP_WORKERS`     | `1`                                                              | number of workers processing expired or revoked access tokens              |
| `IDENTITY_SERVER_DOMAIN`       | `http://localhost:3030/mock-idp/`                                | endpoint of the identity server controlled by the Account Servicing Entity |
| `IDENTITY_SERVER_SECRET`       | `replace-me`                                                     | API key                                                                    |
| `INCOMING_PAYMENT_INTERACTION` | `false`                                                          | flag - incoming payments grants are interactive or not                     |
| `QUOTE_INTERACTION`            | `false`                                                          | flag - quote grants are interactive or not                                 |
| `INTROSPECTION_PORT`           | `3007`                                                           | port of this Open Payments Auth - Token Introspection Server               |
| `LOG_LEVEL`                    | `info`                                                           | [Pino Log Level](https://getpino.io/#/docs/api?id=levels)                  |
| `NODE_ENV`                     | `development`                                                    | node environment, `development`, `test`, or `production`                   |
| `PORT`                         | `3006`                                                           | port of this Open Payments Auth Server, same as in `AUTH_SERVER_DOMAIN`    |
| `WAIT_SECONDS`                 | `5`                                                              | wait time included in `grant.continue`                                     |

#### Frontend

| Variable      | Default                         | Description                           |
| ------------- | ------------------------------- | ------------------------------------- |
| `GRAPHQL_URL` | `http://localhost:3001/graphql` | URL for the GraphQL Admin API         |
| `PORT`        | `3005`                          | Port from which to host the Remix app |
