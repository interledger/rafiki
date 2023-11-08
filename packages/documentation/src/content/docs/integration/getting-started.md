---
title: Getting Started
---

:::caution
Rafiki is intended to be run by [Account Servicing Entities](/reference/glossary#account-servicing-entity) only and should not be used in production by non-regulated entities.
:::

Account Servicing Entities provide and maintain payment accounts. In order to make these accounts Interledger-enabled via Rafiki, they need to provide the following endpoints and services:

- [exchange rates](#exchange-rates)
- [webhook events listener](#webhook-events-listener)
- [Identity Provider](#identity-provider)

Furthermore, each payment account managed by the Account Servicing Entity needs to be issued at least one [wallet address](#issuing-wallet-addresses) in order to be serviced by Rafiki and send or receive Interledger payments.

## Exchange Rates

Every Interledger payment is preceded by a rate probe that estimates the costs for transferring value from A to B over the network (= network fee). For the rate probe to be successful, Rafiki needs to be provided with the current exchange rate by the Account Servicing Entity. The Account Servicing Entity needs to expose an endpoint that accepts a `GET` requests and responds as follows.

#### Response Body

| Variable Name        | Type   | Description                                                                                            |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `base`               | String | asset code represented as [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD` |
| `rates`              | Object | Object containing `<asset_code : exchange_rate>` pairs, e.g. `{EUR: 0.8930}`                           |
| `rates.<asset_code>` | Number | exchange rate given `base` and `<asset_code>`                                                          |

The response status code for a successful request is a `200`. The `mock-account-servicing-entity` includes a [minimalistic example](https://github.com/interledger/rafiki/blob/main/localenv/mock-account-servicing-entity/app/routes/rates.ts).

The `backend` package requires an environment variable called `EXCHANGE_RATES_URL` which MUST specify the URL of this endpoint. An OpenAPI specification of that endpoint can be found [here](https://github.com/interledger/rafiki/blob/main/packages/backend/src/openapi/exchange-rates.yaml).

### Rate Probe Quotes and Fees

The Account Servicing Entity may charge fees on top of the estimated network fee for facilitating the transfer. They can specify fixed and variable fees per asset using the Admin API or UI. How they structure those fees is completely up to the Account Servicing Entity.

Sending fees can be set on a given asset using Admin UI or the `setFee` graphql mutation if desired:

Mutation:

```gql
mutation SetFee($input: SetFeeInput!) {
  setFee(input: $input) {
    code
    success
    message
    fee {
      id
      assetId
      type
      fixed
      basisPoints
      createdAt
    }
  }
}
```

Query Variables:

```json
{
  "input": {
    "assetId": "14863f6f-4bda-42ef-8715-bf4762898af8",
    "type": "SENDING",
    "fee": {
      "fixed": 100,
      "basisPoints": 100
    }
  }
}
```

Example Successful Response

```json
{
  "data": {
    "setFee": {
      "code": "200",
      "success": true,
      "message": "Fee set",
      "fee": {
        "id": "140fd9c0-8f14-4850-9724-102f04d97e69",
        "assetId": "14863f6f-4bda-42ef-8715-bf4762898af8",
        "type": "SENDING",
        "fixed": "100",
        "basisPoints": 100,
        "createdAt": "2023-09-13T14:59:53.435Z"
      }
    }
  }
}
```

## Webhook Events Listener

Rafiki itself does not hold any balances but needs to be funded for outgoing transfers and money needs to be withdrawn for incoming transfers. In order to notify the Account Servicing Entity about those transfer events, they need to expose a webhook endpoint that listens for these events and reacts accordingly.

The endpoint accepts a `POST` request with

#### Request Body

| Variable Name | Type                          | Description         |
| ------------- | ----------------------------- | ------------------- |
| `id`          | String                        | event id            |
| `type`        | Enum: [EventType](#eventtype) |                     |
| `data`        | Object                        | any additional data |

#### EventType

| Value                             | Description                                                                 |
| --------------------------------- | --------------------------------------------------------------------------- |
| `incoming_payment.created`        | Incoming payment has been created.                                          |
| `incoming_payment.completed`      | Incoming payment is complete and doesn't accept any incoming funds anymore. |
| `incoming_payment.expired`        | Incoming payment is expired and doesn't accept any incoming funds anymore.  |
| `outgoing_payment.created`        | Outgoing payment was created.                                               |
| `outgoing_payment.completed`      | Outgoing payment is complete.                                               |
| `outgoing_payment.failed`         | Outgoing payment failed.                                                    |
| `wallet_address.not_found`        | A requested wallet address was not found                                    |
| `wallet_address.web_monetization` | Web Monetization payments received via STREAM.                              |
| `asset.liquidity_low`             | Asset liquidity has dropped below defined threshold.                        |
| `peer.liquidity_low`              | Peer liquidity has dropped below defined threshold.                         |

The Account Servicing Entity's expected behavior when observing these webhook events is detailed in the [Event Handlers](/integration/event-handlers) documentation.

The `backend` package requires an environment variable called `WEBHOOK_URL` which MUST specify this endpoint. An OpenAPI specification of that endpoint can be found [here](https://github.com/interledger/rafiki/blob/main/packages/backend/src/openapi/webhooks.yaml).

## Identity Provider

The Rafiki `backend` exposes the [Open Payments](/reference/glossary#open-payments) APIs. They are auth-protected using an opinionated version of the [Grant Negotiation Authorization Protocol](/reference/glossary#gnap) (GNAP). Rafiki comes with a reference implementation of an Open Payments Auth Server--the `auth` package.

The Open Payments Auth Server requires integration with an Identity Provider to handle user authentication and consent. For more information on how to integrate an Identity Provider with the reference implementation of the Open Payments Auth Server, see the docs in the `auth` package.

## Issuing Wallet Addresses

A [Wallet Address](/reference/glossary#wallet-address) is a standardized identifier for a payment account. It can be created using the [Admin API](/integration/management). Note that at least one asset has to be created prior to creating the wallet address since an `assetId` MUST be provided as input variable on wallet address creation.

### Create Asset

Query:

```
mutation CreateAsset ($input: CreateAssetInput!) {
  createAsset(input: $input) {
    code
    success
    message
    asset {
      id
      code
      scale
    }
  }
}
```

Query Variables:

```
{
  "input": {
    "code": "USD",
    "scale": 2
  }
}
```

Example Successful Response

```
{
  "data": {
    "createAsset": {
      "code": "200",
      "success": true,
      "message": "Created Asset",
      "asset": {
        "id": "0ddc0b7d-1822-4213-948e-915dda58850b",
        "code": "USD",
        "scale": 2
      }
    }
  }
}
```

### Create Wallet Address

Query:

```
mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
  createWalletAddress(input: $input) {
    code
    success
    message
    walletAddress {
      id
      createdAt
      publicName
      url
      asset {
        code
        id
        scale
      }
    }
  }
}
```

Query Variables:

```
{
  "input": {
    "assetId": "0ddc0b7d-1822-4213-948e-915dda58850b",
    "publicName": "Sarah Marshall",
    "url": "https://example.wallet.com/sarah"
  }
}
```

Example Successful Response

```
{
  "data": {
    "createWalletAddress": {
      "code": "200",
      "success": true,
      "message": "Created wallet address",
      "walletAddress": {
        "id": "695e7546-1803-4b45-96b6-6a53f4082018",
        "createdAt": "2023-03-03T09:07:01.107Z",
        "publicName": "Sarah Marshall",
        "url": "https://example.wallet.com/sarah",
        "asset": {
          "id": "0ddc0b7d-1822-4213-948e-915dda58850b",
          "code": "USD",
          "scale": 2
        }
      }
    }
  }
}
```

The Account Servicing Entity SHOULD store at least the `walletAddress.id` in their internal database to be able to reference the account and wallet address.

### Create Wallet Address Key

In order to use the [Open Payments](/reference/glossary#open-payments) APIs, a wallet address needs to be associated with at least one private-public-keypair to be able to sign API request. One or multiple public keys are linked to the wallet address such that third-parties can verify said request signatures. It can be added using the [Admin API](/integration/management).

Query:

```
mutation CreateWalletAddressKey($input: CreateWalletAddressKeyInput!) {
  createWalletAddressKey(input: $input) {
    code
    message
    success
    walletAddressKey {
      id
      walletAddressId
      revoked
      jwk {
        alg
        crv
        kid
        kty
        x
      }
      createdAt
    }
  }
}
```

Query Variables:

```
{
  "input": {
    "jwk": {
      "kid": "keyid-97a3a431-8ee1-48fc-ac85-70e2f5eba8e5",
      "x": "ubqoInifJ5sssIPPnQR1gVPfmoZnJtPhTkyMXNoJF_8",
      "alg": "EdDSA",
      "kty": "OKP",
      "crv": "Ed25519"
    },
    "walletAddressId": "695e7546-1803-4b45-96b6-6a53f4082018"
  }
}
```

Example Successful Response

```
{
  "data": {
    "createWalletAddressKey": {
      "code": "200",
      "message": "Added Key To Wallet Address",
      "success": true,
      "walletAddressKey": {
        "id": "f2953571-f10c-44eb-ab41-4450a7ad6771",
        "walletAddressId": "695e7546-1803-4b45-96b6-6a53f4082018",
        "revoked": false,
        "jwk": {
          "alg": "EdDSA",
          "crv": "Ed25519",
          "kid": "keyid-97a3a431-8ee1-48fc-ac85-70e2f5eba8e5",
          "kty": "OKP",
          "x": "ubqoInifJ5sssIPPnQR1gVPfmoZnJtPhTkyMXNoJF_8"
        },
        "createdAt": "2023-03-03T09:26:41.424Z"
      }
    }
  }
}
```
