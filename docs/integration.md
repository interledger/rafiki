# Integrate with Rafiki

**❗ Rafiki is intended to be run by [Account Servicing Entities](./glossary.md#account-servicing-entity) only and should not be used in production by non-regulated entities.**

Account Servicing Entities provide and maintain payment accounts. In order to make these accounts Interledger-enabled via Rafiki, they need to provide the following endpoints and services:

- prices (exchange rates)
- fees
- [webhook events listener](#webhook-events-listener)
- (optional) [Open Payments Auth Server](#open-payments-auth-server)

Furthermore, each payment account managed by the Account Servicing Entity needs to be issued at least one [payment pointer](#issuing-payment-pointers) in order to be serviced by Rafiki and send or receive Interledger payments.

## Quotes / Rates and Fees

Every Interledger payment is preceded with a quote that estimates the costs for transfering value from A to B. The Account Servicing Entity may charge fees on top of that for facilitating that transfer. How they structure those fees is completely up to the Account Servicing Entity.

### Rates (Prices)

For the quoting to be successful, Rafiki needs to be provided with the current exchange rate by the Account Servicing Entity. The Account Servicing Entity needs to expose an endpoint that accepts a `GET` requests and responds as follows.

#### Response Body

| Variable Name        | Type   | Description                                                                                            |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `base`               | String | asset code represented as [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD` |
| `rates`              | Object | Object containing `<asset_code : exchange_rate>` pairs, e.g. `{EUR: 1.1602}`                           |
| `rates.<asset_code>` | Number | exchange rate given `base` and `<asset_code>`                                                          |

The response status code for a successful request is a `200`. The `mock-account-provider` includes a [minimalistic example](../packages/mock-account-provider/app/routes/prices.ts).

The `backend` package requires an environment variable called `PRICES_URL` which MUST specify the URL of this endpoint.

### Fees

If the Account Servicing Entity decides to add sending fees, it is required to provide an endpoint that is accessible to the Rafiki backend. It accepts a `POST` request with

#### Request Body

| Variable Name      | Type                                     | Description                                 |
| ------------------ | ---------------------------------------- | ------------------------------------------- |
| `id`               | String                                   | Interledger quote id                        |
| `paymentType`      | Enum: `'FixedSend'` \| `'FixedDelivery'` | fixed-send or fixed-receive payment         |
| `paymentPointerId` | String                                   | id of sending payment pointer               |
| `receiver`         | String                                   | receiving payment pointer                   |
| `sendAmount`       | [Amount](#amount)                        | defined or quoted send amount               |
| `receiveAmount`    | [Amount](#amount)                        | defined or quoted receive amount            |
| `createdAt`        | String                                   | creation date and time of Interledger quote |
| `expiresAt`        | String                                   | expiry date and time of Interledger quote   |

#### Amount

(The example amount is $42.42.)

| Variable Name | Type                       | Description                                                                                               |
| ------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `value`       | String // Number // bigint | e.g. `"4242"` or `4242`                                                                                   |
| `assetCode`   | String                     | [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD`                              |
| `assetScale`  | Number                     | difference in orders of magnitude between the standard unit and a corresponding fractional unit, e.g. `2` |

If the payment is a `FixedSend` payment, this endpoint should deduct its fees from the receive amount value. If the payment is a `FixedDelivery` payment, this endpoint should add the fees to the send amount value. The response body MUST be equal to the [request body](#request-body) apart from the updated `sendAmount` or `receiveAmount` values. The response status code for a successful request is a `201`. The `mock-account-provider` includes a [minimalistic example](../packages/mock-account-provider/app/routes/quotes.ts).

The `backend` package requires an environment variable called `QUOTE_URL` which MUST specify the URL of this endpoint.

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

| Value                              | Description                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `incoming_payment.completed`       | Incoming payment is complete and doesn't accept any incoming funds anymore. |
| `incoming_payment.expired`         | Incoming payment is expired and doesn't accept any incoming funds anymore.  |
| `outgoing_payment.created`         | Outgoing payment was created.                                               |
| `outgoing_payment.completed`       | Outgoing payment is complete.                                               |
| `outgoing_payment.failed`          | Outgoing payment failed.                                                    |
| `payment_pointer.web_monetization` | Web Monetization payments received via STREAM.                              |

The `backend` package requires an environment variable called `WEBHOOK_URL` which MUST specify this endpoint.

### Event Handlers

#### `incoming_payment.completed`

An [Open Payments](./glossary#open-payments) Incoming Payment was completed, either manually or programmatically, i.e. it does not accept any incoming funds anymore. The Account Servicing Entity SHOULD withdraw all funds received and deposit them into the payee's account.

- Action: Withdraw liquidity

#### `incoming_payment.expired`

An [Open Payments](./glossary#open-payments) Incoming Payment has expired, i.e. it does not accept any incoming funds anymore. The Account Servicing Entity SHOULD withdraw any funds already received and deposit them into the payee's account.

- Action: Withdraw liquidity

#### `outgoing_payment.created`

An [Open Payments](./glossary#open-payments) Outgoing Payment has been created. It requires liquidity to be processed. The Account Servicing Entity SHOULD reserve the maximum requisite funds for the payment attempt on the payer's account.

- Action: Deposit liquidity

#### `outgoing_payment.completed`

An [Open Payments](./glossary#open-payments) Outgoing Payment was completed, i.e. it won't send any further funds. The Account Servicing Entity SHOULD withdraw any excess liquidity and deposit it into the payer's account.

- Action: Withdraw liquidity

#### `outgoing_payment.failed`

An [Open Payments](./glossary#open-payments) Outgoing Payment failed to send all (or any) of the funds and won't re-try. The Account Servicing Entity SHOULD withdraw all or any excess liquidity and return it to the payer's account.

- Action: Withdraw liquidity

#### `payment_pointer.web_monetization`

A [Web Monetization](./glossary.md#web-monetization) payment has been received via [STREAM](./glossary.md#stream) by a payment pointer. The Account Servicing Entity SHOULD withdraw all funds received and deposit them into the payee's account.

- Action: Withdraw liquidity

## Open Payments Auth Server

The Rafiki `backend` exposes the [Open Payments](./glossary#open-payments) APIs. They are auth-protected using an opinionated version of the [Grant Negotiation Authorization Protocol](./glossary.md#grant-negotiation-authorization-protocol) (GNAP). While Rafiki comes with a reference implementation of an Open Payments Auth Server--the `auth` package--an [Account Servicing Entity](./glossary.md#account-servicing-entity) may implement its own Open Payments Auth Server.

Furthermore, the Open Payments Auth Server requires integration with an Identity Provider to handle user authentication and consent. For more information on how to integrate an Identity Provider with the reference implementation of the Open Payments Auth Server, see the docs in the `auth` package.

## Issuing Payment Pointers

A [Payment Pointer](./glossary.md#payment-pointer) is a standardized identifier for a payment account. It can be created using the [Admin API](./admin-api.md). Note that at least one asset has to be created prior to creating the payment pointer since an `assetId` MUST be provided as input variable on payment pointer creation.

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

### Create Payment Pointer

Query:

```
mutation CreatePaymentPointer($input: CreatePaymentPointerInput!) {
  createPaymentPointer(input: $input) {
    code
    success
    message
    paymentPointer {
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
    "createPaymentPointer": {
      "code": "200",
      "success": true,
      "message": "Created payment pointer",
      "paymentPointer": {
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

The Account Servicing Entity SHOULD store at least the `paymentPointer.id` in their internal database to be able to reference the account and payment pointer.

### Create Payment Pointer Key

In order to use the [Open Payments](./glossary.md#open-payments) APIs, a payment pointer needs to be associated with at least one private-public-keypair to be able to sign API request. One or multiple public keys are linked to the payment pointer such that third-parties can verify said request signatures. It can be added using the [Admin API](./admin-api.md).

Query:

```
mutation CreatePaymentPointerKey($input: CreatePaymentPointerKeyInput!) {
  createPaymentPointerKey(input: $input) {
    code
    message
    success
    paymentPointerKey {
      id
      paymentPointerId
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
    "paymentPointerId": "695e7546-1803-4b45-96b6-6a53f4082018"
  }
}
```

Example Successful Response

```
{
  "data": {
    "createPaymentPointerKey": {
      "code": "200",
      "message": "Added Key To Payment Pointer",
      "success": true,
      "paymentPointerKey": {
        "id": "f2953571-f10c-44eb-ab41-4450a7ad6771",
        "paymentPointerId": "695e7546-1803-4b45-96b6-6a53f4082018",
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
