# Deploying Rafiki

## Local Environment

We have created a suite of packages that, together, mock an account provider that has deployed Rafiki, exposing an [SPSP](./glossary.md#simple-payments-setup-protocol-spsp) endpoint, the [Open Payments](./glossary.md#open-payments) APIs with its required [GNAP](./glossary.md#grant-negotiation-authorization-protocol) auth endpoints to request grants, as well as the STREAM endpoint for receiving Interledger packets. Additionally, we provide a simple request signing service that is used by Postman to generate request signatures required by the Open Payments APIs.

These packages include

- `backend` (SPSP, Open Payments APIs, Admin APIs, STREAM endpoint)
- `auth` (GNAP auth server)
- `mock-account-provider` (mocks an [Account Servicing Entity](./glossary.md#account-servicing-entity))
- `http-signature-utils` (request signature generation for Postman)

These packages depend on the following databases

- Tigerbeetle or Postgres (accounting)
- Postgres (Open Payments resources, auth resources)
- Redis (STREAM details)

We provide containerized versions of our packages together with two pre-configured docker-compose files ([peer1](../infrastructure/local/docker-compose.yml) and [peer2](../infrastructure/local/peer-docker-compose.yml))to start two Mock Account Providers with their respective Rafiki backend and auth servers. They automatically peer and 2 to 3 user accounts are created on both of them.

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

### Exploring Accounts on Mock account provider

Navigate to `localhost:3030` to view the accounts on one instance of the Mock Account Provider called Cloud Nine Wallet.

![Mock Account Provider Accounts](./img/map-accounts.png)

The accounts of the second instance (Happy Life Bank) can be found on `localhost:3031`.

When clicking on the Account Name, a list of Transactions appears.

![Mock Account Provider Transactions](./img/map-transactions.png)

### Admin APIs

The Admin APIs can be interacted with either by using the Apollo explorer (on `localhost:3001/graphql` and `localhost:4001:graphql`, respectively), or by using the [Postman collection](https://www.postman.com/interledger/workspace/interledger/folder/22855701-ba745403-c5e8-4893-9dff-bccb72ea0614?ctx=documentation). The Postman collection is configured to use the default endpoints of the local environment.

### Open Payments APIs

The Open Payments APIs can be interacted with using the Postman collection ([Open Payments APIs](https://www.postman.com/interledger/workspace/interledger/folder/22855701-1b204bc1-c8e5-44d4-bab9-444d7204b15a?ctx=documentation) and [Open Payments Auth APIs](https://www.postman.com/interledger/workspace/interledger/folder/22855701-ae80b96d-4d25-42b9-94fa-8ed17f0e5ed9?ctx=documentation)). It is configured to use the default endpoints of the local environment.

The Examples folder in the Postman collection includes an [eCommerce example](https://www.postman.com/interledger/workspace/interledger/folder/22855701-e27838da-dd72-4b5e-9f1e-086ddfa4d098?ctx=documentation) that can be executed one by one. It

1. requests a grant to create an incoming payment on Philip Fry's account
2. creates an incoming payment on Philip Fry's account
3. requests a grant to create (and read) a quote and an outgoing payment on Grace Franklin's account)
4. continues the grant request
5. creates a quote on Grace Franklin's account
6. creates an outgoing payment on Grace Franklin's account
7. fetches the outgoing payment on Grace Franklin's account

Note that one has to go throught the interaction flow after requesting a grant for a quote and outgoing payment.

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

TODO: Describe helm charts and how to run a kubernetes cluster once we have them
