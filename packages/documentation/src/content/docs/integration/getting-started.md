---
title: Getting Started
---

:::caution
Rafiki is intended to be run by [Account Servicing Entities](/reference/glossary#account-servicing-entity) only and should not be used in production by non-regulated entities.
:::

Account Servicing Entities provide and maintain payment accounts. In order to make these accounts Interledger-enabled via Rafiki, they need to provide the following endpoints and services:

- [exchange rates](#exchange-rates)
- [webhook event listener](#webhook-event-listener)
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

The `backend` package requires an environment variable called `EXCHANGE_RATES_URL` which MUST specify the URL of this endpoint. An OpenAPI specification of that endpoint can be found [here](https://github.com/interledger/rafiki/blob/main/packages/backend/src/openapi/specs/exchange-rates.yaml).

## Fees

The Account Servicing Entity may charge fees on top of the estimated network fee for facilitating the transfer. They can specify fixed and variable fees per asset using the Admin API or UI. How they structure those fees is completely up to the Account Servicing Entity.

Sending fees can be set on a given asset using Admin UI or the `setFee` graphql mutation if desired:

Mutation:

```graphql
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

## Webhook Event Listener

Rafiki itself does not hold any user account balances, but instead, keeps track of [liquidity](/concepts/accounting/liquidity) within asset, peer, and payment accounts. This liquidity needs to be managed primarily as a response to certain events that happen in Rafiki. In order for Rafiki to notify the Account Servicing Entity about those events, the Account Servicing Entity need to expose a webhook endpoint that listens for these events and reacts accordingly.

The Account Servicing Entity's expected behavior when observing these webhook events is detailed in the [Webhook Events](/integration/webhook-events) documentation.

## Identity Provider

An Identity Provider is a service that verifies the identity of a user. In order to allow the authorization of payments by third parties, Rafiki must be integrated with an Identity Provider to handle authentication and consent. This information is collected in order to authorize grants made through the [Open Payments Standard](/reference/glossary#open-payments). The Rafiki `backend` exposes the APIs for Open Payments, and requests to them are authorized by an opinionated version of the [Grant Negotiation Authorization Protocol (GNAP)](/reference/glossary/#grant-negotiation-authorization-protocol). A reference implementation of a Open Payments Authorization Server is include with Rafiki in the `auth` package.

The Authorization Server in the `auth` package extends an [API](/concepts/open-payments/grant-interaction/) for integrating Identity Providers to use to begin & finish an interaction to collect authorization, acquire information on a particular grant, and communicate that a user has authorized a grant. An OpenAPI specification of those endpoints can be found [here](https://github.com/interledger/rafiki/blob/main/packages/auth/src/openapi/specs/id-provider.yaml).

## Issuing Wallet Addresses

A [Wallet Address](/reference/glossary#wallet-address) is a standardized identifier for a payment account. It can be created using the [Admin API](/integration/management). Note that at least one asset has to be created prior to creating the wallet address since an `assetId` MUST be provided as input variable on wallet address creation.

### Create Asset

Query:

```graphql
mutation CreateAsset($input: CreateAssetInput!) {
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

```json
{
  "input": {
    "code": "USD",
    "scale": 2
  }
}
```

Example Successful Response

```json
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

```graphql
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

```json
{
  "input": {
    "assetId": "0ddc0b7d-1822-4213-948e-915dda58850b",
    "publicName": "Sarah Marshall",
    "url": "https://example.wallet.com/sarah"
  }
}
```

Example Successful Response

```json
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

```graphql
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

```json
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

```json
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
