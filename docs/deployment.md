# Deploying Rafiki

## Local Environment

We have created a suite of packages that, together, mock an account servicing entity that has deployed Rafiki, exposing an [SPSP](./glossary.md#simple-payments-setup-protocol-spsp) endpoint, the [Open Payments](./glossary.md#open-payments) APIs with its required [GNAP](./glossary.md#grant-negotiation-authorization-protocol) auth endpoints to request grants, as well as the STREAM endpoint for receiving Interledger packets. Additionally, we provide a simple request signing service that is used by Postman to generate request signatures required by the Open Payments APIs.

These packages include:

- `backend` (SPSP, Open Payments APIs, Admin APIs, STREAM endpoint)
- `auth` (GNAP auth server)
- `mock-account-servicing-entity` (mocks an [Account Servicing Entity](./glossary.md#account-servicing-entity))
- `local-http-signatures` (request signature generation for Postman)
- `frontend` (UI for Rafiki Admin management via interaction with the `backend` Admin APIs)

These packages depend on the following databases

- TigerBeetle or Postgres (accounting)
- Postgres (Open Payments resources, auth resources)
- Redis (STREAM details)

We provide containerized versions of our packages together with two pre-configured docker-compose files ([peer1](../localenv/cloud-nine-wallet/docker-compose.yml) and [peer2](../localenv/happy-life-bank/docker-compose.yml))to start two Mock Account Servicing Entities with their respective Rafiki backend and auth servers. They automatically peer and 2 to 3 user accounts are created on both of them.

### Running the local environment

Dependencies:

- [Rafiki local environment setup](../README.md#environment-setup)
- [docker](https://docs.docker.com/get-docker/)
- [compose plugin](https://docs.docker.com/compose/install/compose-plugin/)
- (optional) [Postman](https://www.postman.com/downloads/)

The following should be run from the root of the project.

```
// If you have spun up this environment before then run
pnpm localenv:stop && pnpm localenv:dbvolumes:remove

// Start the local environment
pnpm localenv:start
```

### Exploring Accounts on Mock Account Servicing Entity

Navigate to `localhost:3030` to view the accounts on one instance of the Mock Account Servicing Entity called Cloud Nine Wallet.

![Mock Account Servicing Entity Accounts](./img/map-accounts.png)

The accounts of the second instance (Happy Life Bank) can be found on `localhost:3031`.

When clicking on the Account Name, a list of Transactions appears.

![Mock Account Servicing Entity Transactions](./img/map-transactions.png)

### Admin UI

In order to manage, and view information about the Rafiki instance(s) via a UI, you can navigate to `localhost:3010` (Cloud Nine Wallet) or `localhost:4010` (Happy Life Bank). This `frontend` project runs a Remix app that queries info and executes mutations against the [Admin APIs](#admin-apis)

### Admin APIs

In addition to the using the Admin UI for interacting with the Admin APIs, you can also use the Apollo explorer (on `localhost:3001/graphql` and `localhost:4001:graphql`, respectively), and also via the [Postman collection](https://www.postman.com/interledger/workspace/interledger/folder/22855701-ba745403-c5e8-4893-9dff-bccb72ea0614?ctx=documentation). The Postman collection is configured to use the default endpoints of the local environment.

### Open Payments APIs

The Open Payments APIs can be interacted with using the Postman collection ([Open Payments APIs](https://www.postman.com/interledger/workspace/interledger/folder/22855701-1b204bc1-c8e5-44d4-bab9-444d7204b15a?ctx=documentation) and [Open Payments Auth APIs](https://www.postman.com/interledger/workspace/interledger/folder/22855701-ae80b96d-4d25-42b9-94fa-8ed17f0e5ed9?ctx=documentation)). It is configured to use the default endpoints of the local environment.

The Examples folder in the Postman collection includes an [eCommerce example](https://www.postman.com/interledger/workspace/interledger/folder/22855701-e27838da-dd72-4b5e-9f1e-086ddfa4d098?ctx=documentation) that can be executed one by one. It

1. requests a grant to create an incoming payment on Philip Fry's account
2. creates an incoming payment on Philip Fry's account
3. requests a grant to create (and read) a quote on Grace Franklin's account
4. creates a quote on Grace Franklin's account
5. requests a grant to create (and read) an outgoing payment on Grace Franklin's account
6. continues the grant request
7. creates an outgoing payment on Grace Franklin's account
8. fetches the outgoing payment on Grace Franklin's account

Note that one has to go through the interaction flow after requesting a grant for a outgoing payment.

<video alt="Screen Recoding eCommerce Example" src="./mov/eCom-example.mov" width="560" height="315" controls></video>

### SPSP

Every payment pointer also serves as an SPSP endpoint. A GET request to e.g. `http://localhost:3000/accounts/gfranklin` with `Accept` header `application/spsp4+json` will return an SPSP response with STREAM connection details.

```http
http GET http://localhost:3000/accounts/gfranklin Host:backend Accept:application/spsp4+json

HTTP/1.1 200 OK
Connection: keep-alive
Content-Length: 220
Content-Type: application/spsp4+json
Date: Thu, 23 Feb 2023 13:07:24 GMT
Keep-Alive: timeout=5

{
    "destination_account": "test.rafiki.viXmy1OVHgvmQakNjX1C6kQMri92DzHeISEv-5VzTDuFhrpsrkDzsq5OO9Lfa9yed0L2RJGC9hA_IX-zztTtTZ87shCYvsQ",
    "receipts_enabled": false,
    "shared_secret": "Rz_vudcg13EPs8ehL2drvZFJS1LJ4Y3EltOI60-lQ78"
}

```

### Shutting down the local environment

```
// tear down
pnpm localenv:stop

// delete database volumes (containers must be removed first with e.g. pnpm localenv:stop)
pnpm localenv:dbvolumes:remove
```

## Production Environment

The production environment consists of

- `backend`
- (optional but recommended) `auth`

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

TODO: Describe helm charts and how to install them on kubernetes cluster once we have them

```
// add rafiki repository
$ helm repo add ...

// install rafiki components
$ helm install ...
```

### Environment Variables

#### Backend

| Variable                        | Default                                                     | Description                                                              |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ADMIN_PORT`                    | `3001`                                                      | GraphQL Server port                                                      |
| `AUTH_SERVER_GRANT_URL`         | `http://127.0.0.1:3006`                                     | endpoint to on the Open Payments Auth Server to request a grant          |
| `AUTH_SERVER_INTROSPECTION_URL` | `http://127.0.0.1:3007/introspect`                          | endpoint to on the Open Payments Auth Server to introspect an auth token |
| `CONNECTOR_PORT`                | `3002`                                                      | STREAM/ILP connector port                                                |
| `DATABASE_URL`                  | `postgresql://postgres:password@localhost:5432/development` | Postgres database URL                                                    |
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
| `PRICES_LIFETIME`               | `15_000`                                                    | milliseconds                                                             |
| `PRICES_URL`                    | `undefined`                                                 | endpoint on the Account Servicing Entity to request receiver fees        |
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
| `AUTH_SERVER_DOMAIN`           | `http://localhost:3006`                                          | endpoint of this Open Payments Auth Server                                 |
| `COOKIE_KEY`                   | 32 random bytes                                                  | signed cookie key                                                          |
| `DATABASE_CLEANUP_WORKERS`     | `1`                                                              | number of workers processing expired or revoked access tokens              |
| `IDENTITY_SERVER_DOMAIN`       | `http://localhost:3030/mock-idp/`                                | endpoint of the identity server controlled by the Account Servicing Entity |
| `IDENTITY_SERVER_SECRET`       | `replace-me`                                                     | API key                                                                    |
| `INCOMING_PAYMENT_INTERACTION` | `false`                                                          | flag - incoming payments grants are interactive or not                     |
| `QUOTE_INTERACTION`            | `false`                                                          | flag - quote grants are interactive or not                                 |
| `INTROSPECTION_HTTPSIG`        | `false`                                                          | flag - check http signature on introspection requests                      |
| `LOG_LEVEL`                    | `info`                                                           | [Pino Log Level](https://getpino.io/#/docs/api?id=levels)                  |
| `NODE_ENV`                     | `development`                                                    | node environment, `development`, `test`, or `production`                   |
| `PORT`                         | `3006`                                                           | port of this Open Payments Auth Server, same as in `AUTH_SERVER_DOMAIN`    |
| `WAIT_SECONDS`                 | `5`                                                              | wait time included in `grant.continue`                                     |
