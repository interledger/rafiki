---
title: Overview
---

We have created a suite of packages that, together, mock an account servicing entity that has deployed Rafiki, exposing an [SPSP](/reference/glossary#simple-payments-setup-protocol-spsp) endpoint, the [Open Payments](/reference/glossary#open-payments) APIs with its required [GNAP](/reference/glossary#grant-negotiation-authorization-protocol) auth endpoints to request grants, a STREAM endpoint for receiving Interledger packets, and a UI to view and manage the Rafiki instance. Additionally, we provide a simple request signing service that is used by Postman to generate request signatures required by the Open Payments APIs.

These packages include:

- `backend` (SPSP, Open Payments APIs, GraphQL Admin APIs, STREAM endpoint)
- `auth` (GNAP auth server)
- `mock-account-servicing-entity` (mocks an [Account Servicing Entity](/reference/glossary#account-servicing-entity))
- `frontend` (Remix app to expose a UI for Rafiki Admin management via interaction with the `backend` Admin APIs)
- `local-http-signatures` (request signature generation for Postman)

These packages depend on the following databases:

- TigerBeetle or Postgres (accounting)
- Postgres (Open Payments resources, auth resources)
- Redis (STREAM details)

We provide containerized versions of our packages together with two pre-configured docker-compose files ([peer1](https://github.com/interledger/rafiki/blob/main/localenv/cloud-nine-wallet/docker-compose.yml) and [peer2](https://github.com/interledger/rafiki/blob/main/localenv/happy-life-bank/docker-compose.yml)) to start two Mock Account Servicing Entities with their respective Rafiki backend and auth servers. They automatically peer and 2 to 3 user accounts are created on both of them.

This environment will set up an playground where you can use the Rafiki Admin APIs and the Open Payments APIs.

## Environment overview

![Docker compose environment](/img/localenv-architecture.png)

#### Cloud Nine Wallet

(a) User Interface - accessible at http://localhost:3030

(b) Admin API - accessible at http://localhost:3001/graphql

(c) Open Payments API - accessible at http://localhost:3000

(d) Rafiki Admin - accessible at http://localhost:3010

(e) Open Payments Auth API - accessible at http://localhost:3006

(f) Postman Signature Service - accessible at http://localhost:3040

#### Happy Life Bank

(g) User Interface - accessible at http://localhost:3031

(h) Admin API - accessible at http://localhost:4001/graphql

(i) Open Payments API - accessible at http://localhost:4000

(j) Rafiki Admin - accessible at http://localhost:4010

(k) Open Payments Auth API - accessible at http://localhost:4006

(l) Postman Signature Service - accessible at http://localhost:3041

#### Database

(m) Postgres Server - accessible at http://localhost:5432

### Exploring Accounts on Mock Account Servicing Entity

Navigate to [`localhost:3030`](http://localhost:3030) to view the accounts on one instance of the Mock Account Servicing Entity called Cloud Nine Wallet.

![Mock Account Servicing Entity Accounts](/img/map-accounts.png)

The accounts of the second instance (Happy Life Bank) can be found on [`localhost:3031`](http://localhost:3031).

When clicking on the Account Name, a list of Transactions appears.

![Mock Account Servicing Entity Transactions](/img/map-transactions.png)

## Running the local environment

### Dependencies

- [Rafiki local environment setup](https://github.com/interledger/rafiki/blob/main/README.md#environment-setup)
- [docker](https://docs.docker.com/get-docker/)
- [postman](https://www.postman.com/downloads/)

### Setup

The following should be run from the root of the project.

```
// If you have spun up the environment before, remember to first tear down and remove volumes!

// start the local environment
pnpm localenv:compose up

// tear down and remove volumes
pnpm localenv:compose down --volumes
```

If you want to use Postgres as the accounting database instead of TigerBeetle, you can use the `psql` variant of the `localenv:compose` commands:

```
pnpm localenv:compose:psql up
pnpm localenv:compose:psql down --volumes
```

The local environment consists of a primary Rafiki instance and a secondary Rafiki instance, each with
its own docker compose files ([Cloud Nine Wallet](https://github.com/interledger/rafiki/blob/main/localenv/cloud-nine-wallet/docker-compose.yml), [Happy Life Bank](https://github.com/interledger/rafiki/blob/main/localenv/happy-life-bank/docker-compose.yml)).
The primary Cloud Nine Wallet docker compose file (`./cloud-nine-wallet/docker-compose.yml`) includes the main Rafiki services `backend` and `auth`, as well
as the required data stores tigerbeetle (if enabled), redis, and postgres, so it can be run on its own. Furthermore,
both include the `local-signature-utils` signature generation app for Postman.
The secondary Happy Life Bank docker compose file (`./happy-life-bank/docker-compose.yml`) includes only the Rafiki services, not the data stores. It uses the
data stores created by the primary Rafiki instance so it can't be run by itself.
The `pnpm localenv:compose up` command starts both the primary instance and the secondary.

### Shutting down

```
// tear down
pnpm localenv:compose down

// tear down and delete database volumes
pnpm localenv:compose down --volumes
```

### Commands

| Command                                     | Description                                 |
| ------------------------------------------- | ------------------------------------------- |
| `pnpm localenv:compose config`              | Show all merged config (with Tigerbeetle)   |
| `pnpm localenv:compose up`                  | Start (with Tigerbeetle)                    |
| `pnpm localenv:compose up -d`               | Start (with Tigerbeetle) detached           |
| `pnpm localenv:compose down`                | Down (with Tigerbeetle)                     |
| `pnpm localenv:compose down --volumes`      | Down and kill volumes (with Tigerbeetle)    |
| `pnpm localenv:compose:psql config`         | Show all merged config (with Postgresql)    |
| `pnpm localenv:compose build`               | Build all the containers (with Tigerbeetle) |
| `pnpm localenv:compose:psql up`             | Start (with Postgresql)                     |
| `pnpm localenv:compose:psql up -d`          | Start (with Postgresql) detached            |
| `pnpm localenv:compose:psql down`           | Down (with Postgresql)                      |
| `pnpm localenv:compose:psql down --volumes` | Down (with Postgresql) and kill volumes     |
| `pnpm localenv:compose:psql build`          | Build all the containers (with Postgresql)  |

### Usage

#### Postman & Open Payments APIs

The Open Payments APIs can be interacted with using the [Postman collection](https://www.postman.com/interledger/workspace/interledger/api/84fc90ca-3153-4865-8b49-b91218e5d574). It is configured to use the default endpoints of the local environment.

The Examples folder in the Postman collection includes an eCommerce (Open Payments) example that can be executed one by one. It

1. requests a grant to create an incoming payment on Philip Fry's account
2. creates an incoming payment on Philip Fry's account
3. requests a grant to create (and read) a quote on Grace Franklin's account
4. creates a quote on Grace Franklin's account
5. requests a grant to create (and read) an outgoing payment on Grace Franklin's account
6. continues the grant request (via the interaction flow)
7. creates an outgoing payment on Grace Franklin's account
8. fetches the outgoing payment on Grace Franklin's account

Note that one has to go through the interaction flow after requesting a grant for a outgoing payment. More information about the interaction flow can be found [here](/concepts/open-payments/grant-interaction).

Example walkthrough:

https://user-images.githubusercontent.com/15069181/230445040-6fa505f5-86e5-44b2-841e-77c97d646368.mp4

#### Admin UI

In order to manage, and view information about the Rafiki instance(s) using a UI, you can navigate to [`localhost:3010`](http://localhost:3010) (Cloud Nine Wallet) or [`localhost:4010`](http://localhost:4010) (Happy Life Bank). This is the `frontend` project which runs a Remix app for querying info and executing mutations against the Rafiki [Admin APIs](#admin-apis).

#### Admin APIs

In addition to the using the Admin UI for interacting with the Admin APIs, you can also use the Apollo explorer (on [`localhost:3001/graphql`](http://localhost:3001/graphql) and [`localhost:4001/graphql`](http://localhost:4001/graphql), respectively), and also via the [Postman collection](https://www.postman.com/interledger/workspace/interledger/folder/22855701-ba745403-c5e8-4893-9dff-bccb72ea0614?ctx=documentation). The Postman collection is configured to use the default endpoints of the local environment.

#### SPSP

Every wallet address also serves as an SPSP endpoint. A GET request to e.g. `http://localhost:3000/accounts/gfranklin` with `Accept` header `application/spsp4+json` will return an SPSP response with STREAM connection details.

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
