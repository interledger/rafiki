# Integrate with Rafiki

**❗ Rafiki is intended to be run by [Account Servicing Entities](./glossary.md#account-servicing-entity) only and should not be used in production by non-regulated entities.**

Account Servicing Entities provide and maintain payment accounts. In order to make these accounts Interledger-enabled via Rafiki, they need to provide the following endpoints and services.

## Quotes / Fees

Every Interledger payment is preceded with a quote that estimates the costs for transfering value from A to B. The Account Servicing Entity may charge fees on top of that for facilitating that transfer. How they strucutre those fees is completely up to the Account Servicing Entity.

The Account Servicing Entity is required to provide an endpoint that is accessible to the Rafiki backend. It accepts a `POST` request with

#### Request Body

| Variable Name             | Type                                     | Description                                                                   |
| ------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| id                        | string                                   | Interledger quote id                                                          |
| paymentType               | enum: `'FixedSend'` \| `'FixedDelivery'` | fixed-send or fixed-receive payment                                           |
| paymentPointerId          | string                                   | id of sending payment pointer                                                 |
| receiver                  | string                                   | receiving payment pointer                                                     |
| sendAmount                | [Amount](#amount)                        | defined or quoted send amount                                                 |
| receiveAmount             | [Amount](#amount)                        | defined or quoted receive amount                                              |
| maxPacketAmount           | number // bigint                         | discovered maximum packet amount allowed over chosen Interledger payment path |
| minExchangeRate           | number                                   | aggregate exchange rate the payment is guaranteed to meet                     |
| lowEstimatedExchangeRate  | number                                   | lower bound of probed exchange rate over the chosen Interledger payment path  |
| highEstimatedExchangeRate | number                                   | upper bound of probed exchange rate over the chosen Interledger payment path  |
| createdAt                 | string                                   | creation date and time of Interledger quote                                   |
| expiresAt                 | string                                   | expiry date and time of Interledger quote                                     |

#### Amount

(The example amount is $42.42.)

| Variable Name | Type             | Description                                                                                               |
| ------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| value         | number // bigint | e.g. `4242`                                                                                               |
| assetCode     | string           | [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD`                              |
| assetScale    | number           | difference in orders of magnitude between the standard unit and a corresponding fractional unit, e.g. `2` |

If the payment is a `FixedSend` payment, this endpoint should deduct its fees from the receive amount value. If the payment is a `FixedDelivery` payment, this endpoint should add the fees to the send amount value. The response body MUST be equal to the [request body](#request-body) apart from the updated `sendAmount` or `receiveAmount` values. The response status code for a successful request is a `201`. The `mock-account-provider` includes a [minimalistic example](../packages/mock-account-provider/app/routes/quotes.ts).

The `backend` package requires an environment variable called `QUOTE_URL` which MUST specify this endpoint.

## Webhook Events

Rafiki itself does not hold any balances but needs to be funded for outgoing transfers and money needs to be withdrawn for incoming transfers. In order to notify the Account Servicing Entity about those transfer events, they need to expose a webhook endpoint that listens for these events and reacts accordingly.

The endpoint accepts a `POST` request with

#### Request Body

| Variable Name | Type                          | Description         |
| ------------- | ----------------------------- | ------------------- |
| id            | string                        | event id            |
| type          | enum: [EventType](#eventtype) |
| data          | Object                        | any additional data |

#### EventType

| Value                    | Description                                                                 |
| ------------------------ | --------------------------------------------------------------------------- |
| IncomingPaymentCompleted | Incoming payment is complete and doesn't accept any incoming funds anymore. |
| IncomingPaymentExpired   | Incoming payment is expired and doesn't accept any incoming funds anymore.  |
| OutgoingPaymentCreated   | Outgoing payment was created.                                               |
| OutgoingPaymentCompleted | Outgoing payment is complete.                                               |
| OutgoingPaymentFailed    | Outgoing payment failed.                                                    |

The `backend` package requires an environment variable called `WEBHOOK_URL` which MUST specify this endpoint.

### Event Handlers

#### `IncomingPaymentCompleted`

An [Open Payments](./glossary#open-payments) Incoming Payment was completed, either manually or programmatically, i.e. it does not accept any incoming funds anymore. Any funds already received SHOULD be withdrawn.

- Action: Withdraw liquidity

#### `IncomingPaymentExpired`

An [Open Payments](./glossary#open-payments) Incoming Payment has expired, i.e. it does not accept any incoming funds anymore. Any funds already received SHOULD be withdrawn.

- Action: Withdraw liquidity

#### `OutgoingPaymentCreated`

An [Open Payments](./glossary#open-payments) Outgoing Payment has been created. It requires liquidity to be processed.

- Action: Deposit liquidity

#### `OutgoingPaymentCompleted`

An [Open Payments](./glossary#open-payments) Outgoing Payment was completed, i.e. it won't send any further funds. Any excess liquidity should be withdrawn.

- Action: Withdraw liquidity

#### `OutgoingPaymentFailed`

An [Open Payments](./glossary#open-payments) Outgoing Payment completely of partially failed to send funds and won't re-try sending them. All or any excess liquidity should be withdrawn.

- Action: Withdraw liquidity

## Open Payments

The Rafiki `backend` exposes the [Open Payments](./glossary#open-payments) APIs. The are auth-protected using the [Grant Negotiation Authorization Protocol](./glossary#grant-negotiation-authorization-protocol) (GNAP). While Rafiki comes with a reference implementation of a GNAP server--the `auth` package--an [Account Servicing Entity](./glossary#account-servicing-entity) may implement its own GNAP server.

Furthermore, the GNAP server requires integration with an Identity Provider to handle user authenticatio and consent. For more information on how to integrate an Identity Provider with the reference implementation, see the docs in the `auth` package.
