# Integrate with Rafiki

**❗ Rafiki is intended to be run by [Account Servicing Entities](./glossary.md#account-servicing-entity) only and should not be used in production by non-regulated entities.**

Account Servicing Entities provide and maintain payment accounts. In order to make these accounts Interledger-enabled via Rafiki, they need to provide the following endpoints.

## Quotes / Fees

Every Interledger payment is pre.. with a quote that estimates the costs for transfering value from A to B. The Account Servicing Entity may charge fees on top of that for facilitating that transfer. How they strucutre those fees is completely up to the Account Servicing Entity.

The Account Servicing Entity is required to provide an endpoint that is accessible to the Rafiki backend. It will accept a `POST` request with

#### Request Body

| Variable Name             | Type                                 | Description                                                                   |
| ------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| id                        | string                               | Interledger quote id                                                          |
| paymentType               | enum: `FixedSend` \| `FixedDelivery` | fixed-send or fixed-receive payment                                           |
| paymentPointerId          | string                               | id of sending payment pointer                                                 |
| receiver                  | string                               | receiving payment pointer                                                     |
| sendAmount                | [Amount](#amount)                    | defined or quoted send amount                                                 |
| receiveAmount             | [Amount](#amount)                    | defined or quoted receive amount                                              |
| maxPacketAmount           | number // bigint                     | discovered maximum packet amount allowed over chosen Interledger payment path |
| minExchangeRate           | number                               | aggregate exchange rate the payment is guaranteed to meet                     |
| lowEstimatedExchangeRate  | number                               | lower bound of probed exchange rate over the chosen Interledger payment path  |
| highEstimatedExchangeRate | number                               | upper bound of probed exchange rate over the chosen Interledger payment path  |
| createdAt                 | string                               | creation date and time of Interledger quote                                   |
| expiresAt                 | string                               | expiry date and time of Interledger quote                                     |

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
