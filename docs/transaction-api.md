# Transaction API

## Quote

The wallet creates a quote on behalf of a user by passing details to `Mutation.createQuote`.

First, the recipient Open Payments payment pointer or incoming payment is resolved. Then, the STREAM sender quotes the payment to probe the exchange rate, compute a minimum rate, and discover the path maximum packet amount.

The quote may fail in cases such as if the payment pointer was semantically invalid, the incoming payment was already paid, a terminal ILP Reject was encountered, or the rate was insufficient; or in the case of some transient errors, such as if the Open Payments HTTP query failed, the quote couldn't complete within the timeout, or no external exchange rate was available.

If the STREAM sender successfully established a connection to the recipient and discovered rates and the path capacity, Rafiki sends the quote details to the wallet's configured quote endpoint. If the quote is acceptable and the `sendAmount.value` does not exceed sender's account balance, the wallet returns `201` with the quote. The wallet may also adjust quote amounts as follows:

- If `quote.paymentType` is `FIXED_SEND`, `receiveAmount.value` may be reduced.
- If `quote.paymentType` is `FIXED_DELIVERY`, `sendAmount.value` may be increased.

Rafiki assigns a deadline based on the expected validity of its slippage parameters for the wallet to fund the payment and returns the created quote.

## Outgoing Payment Lifecycle

### Payment creation

The wallet creates a payment on behalf of a user by passing details to `Mutation.createOutgoingPayment`. The payment is created in the `FUNDING` state.

### Funding

After the payment is created, Rafiki notifies the wallet operator via an `outgoing_payment.created` [webhook event](#webhooks) to reserve the maximum requisite funds for the payment attempt by moving `sendAmount.value` from the funding wallet account owned by the payer to the payment account.

If the wallet funds the payment, the state advances to `SENDING`.

### Payment execution

To send, an instance acquires a lock on a payment with a `SENDING` state.

The instance sends the payment with STREAM, which uses the quote parameters.

After the payment completes, the instance releases the lock on the payment and advances the state depending upon the outcome:

1. Success. If the STREAM sender successfully fulfilled the completion criteria of the payment, sending or delivering the requisite amount, the payment is complete. The instance advances the state to `COMPLETED`, the final state of the payment.
2. Irrevocable failure. In cases such as if the exchange rate changed (the payment cannot be completed within the parameters of the quote), the payment failed permanently, and the state advances to `FAILED`.

   After too many recoverable failures and attempts, Rafiki may also consider a payment permanently failed, advancing the state to `FAILED`.

3. Recoverable failure. Rafiki may elect to automatically retry the payment. The state remains `SENDING`, but internally tracks that the payment failed and when to schedule another attempt. Includes cases such as:
   - an idle timeout
   - the receiver closed the connection
   - a terminal ILP Reject was encountered

### Payment resolution

In the `COMPLETED` and `FAILED` cases, the wallet is notifed of any remaining funds in the payment account via `outgoing_payment.completed` and `outgoing_payment.failed` [webhook events](#webhooks).

## Incoming Payment Lifecycle

### Incoming payment creation

An incoming payment is created according to the [Open Payments](https://docs.openpayments.guide/reference/create-incoming-payment) specification. Rafiki creates a payment account for each incoming payment.

### Receiving

An incoming payment receives funds via Interledger as long as it is not complete or expired.

### Expiry and Completion

An incoming payment expires when it passes the `expiresAt` time.

An incoming payment is completed when it has received its specified `incomingAmount.value` or when it is completed manually via an API call.

When the incoming payment expires, Rafiki notifies the wallet of received funds via the `incoming_payment.expired` [webhook event](#webhooks).

When the incoming payment is completed, Rafiki notifies the wallet of received funds via the `incoming_payment.completed` [webhook event](#webhooks).

An expired incoming payment that has never received money is deleted.

## Webhooks

Rafiki sends webhook events to notify the wallet of payment lifecycle states that require liquidity to be added or removed.

Webhook event handlers must be idempotent and return `200` on success. Rafiki will retry unsuccessful webhook requests for up to one day.

### `EventType`

#### `payment_pointer.web_monetization`

Account has web monetization balance to be withdrawn.

Credit `paymentPointer.received` to the wallet balance for `paymentPointer.id`, and call `Mutation.withdrawEventLiquidity` with the event id.

#### `incoming_payment.expired`

Incoming payment has expired.

Credit `incomingPayment.received` to the wallet balance for `incomingPayment.accountId`, and call `Mutation.withdrawEventLiquidity` with the event id.

#### `incoming_payment.completed`

Incoming payment has received its specified `incomingAmount`.

Credit `incomingPayment.received` to the wallet balance for `incomingPayment.accountId`, and call `Mutation.withdrawEventLiquidity` with the event id.

#### `outgoing_payment.created`

Payment created and needs liquidity in order to send quoted amount.

To fund the payment, deduct `sendAmount.value` from the wallet balance for `payment.accountId` and call `Mutation.depositEventLiquidity` with the event id.

#### `outgoing_payment.failed`

Payment failed.

Credit `payment.balance` to the wallet balance for `payment.accountId`, and call `Mutation.withdrawEventLiquidity` with the event id.

#### `outgoing_payment.completed`

Payment completed sending the quoted amount.

Credit `payment.balance` to the wallet balance for `payment.accountId`, and call `Mutation.withdrawEventLiquidity` with the event id.

### Webhook Event

| Name   | Optional | Type                                                                                                                | Description                                       |
| :----- | :------- | :------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------ |
| `id`   | No       | `ID`                                                                                                                | Unique ID of the webhook event.                   |
| `type` | No       | [`EventType`](#eventtype)                                                                                           | Description of the event.                         |
| `data` | No       | [`PaymentPointer`](#paymentPointer), [`IncomingPayment`](#incomingpayment) or [`OutgoingPayment`](#outgoingpayment) | Object containing data associated with the event. |

## Resources

### `Quote`

The quote must be created with `receiver` and (`sendAmount` xor `receiveAmount`) or no specified amount (assuming the Incoming Payment has an `incomingAmount`).

| Name                       | Optional | Type          | Description                                                                                                                                                                                                                                                                                                               |
| :------------------------- | :------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                       | No       | `ID`          | Unique ID for this quote, randomly generated by Rafiki.                                                                                                                                                                                                                                                                   |
| `paymentType`              | No       | `PaymentType` | See [`PaymentType`](#paymenttype).                                                                                                                                                                                                                                                                                        |
| `maxPacketAmount`          | No       | `UInt64`      | Discovered maximum packet amount allowed over this payment path.                                                                                                                                                                                                                                                          |
| `minExchangeRate`          | No       | `Float`       | Aggregate exchange rate the payment is guaranteed to meet, as a ratio of destination base units to source base units. Corresponds to the minimum exchange rate enforced on each packet (_except for the final packet_) to ensure sufficient money gets delivered. For strict bookkeeping, use `sendAmount.value` instead. |
| `lowExchangeRateEstimate`  | No       | `Float`       | Lower bound of probed exchange rate over the path (inclusive). Ratio of destination base units to source base units.                                                                                                                                                                                                      |
| `highExchangeRateEstimate` | No       | `Float`       | Upper bound of probed exchange rate over the path (exclusive). Ratio of destination base units to source base units.                                                                                                                                                                                                      |
| `paymentPointer`           | No       | `ID`          | The payer's Open Payments payment pointer.                                                                                                                                                                                                                                                                                |
| `sendAmount`               | No       | `Object`      |                                                                                                                                                                                                                                                                                                                           |
| `sendAmount.value`         | No       | `UInt64`      | Fixed amount that will be sent in the base unit and asset of the sending account.                                                                                                                                                                                                                                         |
| `sendAmount.assetScale`    | No       | `Integer`     |                                                                                                                                                                                                                                                                                                                           |
| `sendAmount.assetCode`     | No       | `String`      |                                                                                                                                                                                                                                                                                                                           |
| `receiveAmount`            | No       | `Object`      |                                                                                                                                                                                                                                                                                                                           |
| `receiveAmount.value`      | No       | `UInt64`      | Fixed amount that will be delivered if the payment completes, in the base unit and asset of the receiving account.                                                                                                                                                                                                        |
| `receiveAmount.assetScale` | No       | `Integer`     |                                                                                                                                                                                                                                                                                                                           |
| `receiveAmount.assetCode`  | No       | `String`      |                                                                                                                                                                                                                                                                                                                           |
| `receiver`                 | No       | `String`      | The URL of the Open Payments incoming payment that is being paid.                                                                                                                                                                                                                                                         |
| `createdAt`                | No       | `String`      | ISO 8601 format.                                                                                                                                                                                                                                                                                                          |
| `expiresAt`                | No       | `String`      | ISO 8601 format.                                                                                                                                                                                                                                                                                                          |

### `OutgoingPayment`

The payment must be created with `quoteId`.

| Name                       | Optional | Type                   | Description                                                                                                        |
|:---------------------------| :------- | :--------------------- | :----------------------------------------------------------------------------------------------------------------- |
| `id`                       | No       | `ID`                   | Unique ID for this payment, randomly generated by Rafiki.                                                          |
| `state`                    | No       | `OutgoingPaymentState` | See [`OutgoingPaymentState`](#outgoingpaymentstate).                                                               |
| `description`              | Yes      | `String`               | Human readable description of the outgoing payment.                                                                |
| `externalRef`              | Yes      | `String`               | A reference that can be used by external systems to reconcile this payment with their systems.                     |
| `error`                    | Yes      | `String`               | Failure reason.                                                                                                    |
| `stateAttempts`            | No       | `Integer`              | Retry number at current state.                                                                                     |
| `paymentPointerId`         | No       | `ID`                   | The payer's Open Payments payment pointer.                                                                         |
| `quoteId`                  | No       | `ID`                   | Id of the payment's Open Payments quote.                                                                           |
| `sendAmount`               | No       | `Object`               |                                                                                                                    |
| `sendAmount.value`         | No       | `UInt64`               | Fixed amount that will be sent in the base unit and asset of the sending account.                                  |
| `sendAmount.assetScale`    | No       | `Integer`              |                                                                                                                    |
| `sendAmount.assetCode`     | No       | `String`               |                                                                                                                    |
| `sentAmount`               | No       | `Object`               |                                                                                                                    |
| `sentAmount.value`         | No       | `UInt64`               | Fixed amount that has been sent in the base unit and asset of the sending account.                                 |
| `sentAmount.assetScale`    | No       | `Integer`              |                                                                                                                    |
| `sentAmount.assetCode`     | No       | `String`               |                                                                                                                    |
| `receiveAmount`            | No       | `Object`               |                                                                                                                    |
| `receiveAmount.value`      | No       | `UInt64`               | Fixed amount that will be delivered if the payment completes, in the base unit and asset of the receiving account. |
| `receiveAmount.assetScale` | No       | `Integer`              |                                                                                                                    |
| `receiveAmount.assetCode`  | No       | `String`               |                                                                                                                    |
| `receiver`                 | No       | `String`               | The URL of the Open Payments incoming payment that is being paid.                                                  |
| `peerId`                   | Yes      | `ID`                   | Id of the outgoing peer.                                                                                           |
| `createdAt`                | No       | `String`               | ISO 8601 format.                                                                                                   |

### `OutgoingPaymentState`

- `FUNDING`: Initial state. Awaiting the wallet to add payment liquidity. On success, transition to `SENDING`.
- `SENDING`: Stream payment from the payment account to the destination.
- `FAILED`: The payment failed. (Though some money may have been delivered)
- `COMPLETED`: Successful completion.

### `PaymentType`

- `FIXED_SEND`: Fixed source amount.
- `FIXED_DELIVERY`: Incoming payment, fixed delivery amount.

### `Incoming Payment`

| Name                        | Optional | Type                   | Description                                                                               |
| :-------------------------- | :------- | :--------------------- | :---------------------------------------------------------------------------------------- |
| `id`                        | No       | `ID`                   | Unique ID for this incoming payment, randomly generated by Rafiki.                        |
| `paymentPointer`            | No       | `ID`                   | The recipient's Open Payments payment pointer.                                            |
| `state`                     | No       | `IncomingPaymentState` | See [`IncomingPaymentState`](#incomingpaymentstate)                                       |
| `incomingAmount`            | Yes      | `Object`               | The amount that is expected to be received.                                               |
| `incomingAmount.value`      | No       | `UInt64`               | The amount that will be received in the base unit and asset of the receiving account.     |
| `incomingAmount.assetScale` | No       | `Integer`              |                                                                                           |
| `incomingAmount.assetCode`  | No       | `String`               |                                                                                           |
| `receivedAmount`            | No       | `Object`               | The amount that has been received.                                                        |
| `receivedAmount.value`      | No       | `UInt64`               | The amount that has been received in the base unit and asset of the receiving account.    |
| `receivedAmount.assetScale` | No       | `Integer`              |                                                                                           |
| `receivedAmount.assetCode`  | No       | `String`               |                                                                                           |
| `description`               | Yes      | `String`               | Human readable description of the incoming payment.                                       |
| `externalRef`               | Yes      | `String`               | Human readable external reference to correlate the incoming payment to, e.g., an invoice. |
| `createdAt`                 | No       | `String`               | ISO 8601 format.                                                                          |
| `expiresAt`                 | No       | `String`               | ISO 8601 format.                                                                          |

### `IncomingPaymentState`

- `PENDING`: The payment has a state of `PENDING` when it is initially created.
- `PROCESSING`: As soon as payment has started (funds have cleared into the account) the state moves to `PROCESSING`.
- `COMPLETED`: The payment is either auto-completed once the received amount equals the expected `incomingAmount`, or it is completed manually via an API call.
- `EXPIRED`: If the payment expires before it is completed then the state will move to `EXPIRED` and no further payments will be accepted.

### `PaymentPointer`

| Name        | Optional | Type     | Description                                                       |
| :---------- | :------- | :------- | :---------------------------------------------------------------- |
| `id`        | No       | `ID`     | Unique ID for this payment pointer, randomly generated by Rafiki. |
| `received`  | No       | `UInt64` | The amount received, in base units of the account asset.          |
| `createdAt` | No       | `String` | ISO 8601 format.                                                  |
