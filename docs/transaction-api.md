# Transaction API

## Outgoing Payment Lifecycle

### Payment creation

A user creates a payment by passing a `PaymentIntent` to `Mutation.createOutgoingPayment`. If the payment destination (the payment pointer or invoice URL) is successfully resolved, the payment is created in the `QUOTING` state.

If the payment destination cannot be resolved, no payment is created and the query returns an error.

### QUOTING

To begin a payment attempt, an instance acquires a lock to setup and quote the payment, advancing it from `QUOTING` to the `FUNDING` state.

First, the recipient Open Payments account or invoice is resolved. Then, the STREAM sender quotes the payment to probe the exchange rate, compute a minimum rate, and discover the path maximum packet amount.

Quotes can end in 3 states:

1. Success. The STREAM sender successfully established a connection to the recipient, and discovered rates and the path capacity. This advances the state to `FUNDING`. The parameters of the quote are persisted so they may be resumed if the payment is funded. Rafiki also assigns a deadline based on the expected validity of its slippage parameters for the wallet to fund the payment.
2. Irrevocable failure. In cases such as if the payment pointer or account URL was semantically invalid, the invoice was already paid, a terminal ILP Reject was encountered, or the rate was insufficient, the payment is unlikely to ever succeed, or requires some manual intervention. These cases advance the state to `CANCELLED`.
3. Recoverable failure. In the case of some transient errors, such as if the Open Payments HTTP query failed, the quote couldn't complete within the timeout, or no external exchange rate was available, Rafiki may elect to automatically retry the quote. This returns the state to `QUOTING`, but internally tracks that the quote failed and when to schedule another attempt.

After the quote ends and state advances, the lock on the payment is released.

### Authorization

After quoting completes, Rafiki notifies the wallet operator via an `outgoing_payment.funding` [webhook event](#webhooks) to add `maxSourceAmount` of the quote from the funding wallet account owned by the payer to the payment, reserving the maximum requisite funds for the payment attempt.

If the payment intent did not specify `autoApprove` of `true`, a client should manually approve the payment, based on the parameters of the quote, before the wallet adds payment liquidity.

This step is necessary so the end user can precisely know the maximum amount of source units that will leave their account. Typically, the payment application will present these parameters in the user interface before the user elects to approve the payment. This step is particularly important for invoices, to prevent an unbounded sum from leaving the user's account. During this step, the user may also be presented with additional information about the payment, such as details of the payment recipient, or how much is expected to be delivered.

Authorization ends in two possible states:

1. Approval. If the user approves the payment before its funding deadline, or `autoApprove` was `true`, the wallet funds the payment and the state advances to `SENDING`.

2. Cancellation. If the user explicitly cancels the quote, or the funding deadline is exceeded, the state advances to `CANCELLED`. In the latter case, too much time has elapsed for the enforced exchange rate to remain accurate.

### Payment execution

To send, an instance acquires a lock on a payment with a `SENDING` state.

The instance sends the payment with STREAM, which uses the quote parameters acquired during the `QUOTING` state.

After the payment completes, the instance releases the lock on the payment and advances the state depending upon the outcome:

1. Success. If the STREAM sender successfully fulfilled the completion criteria of the payment, sending or delivering the requisite amount, the payment is complete. The instance advances the state to `COMPLETED`, the final state of the payment.
2. Irrevocable failure. In cases such as if the exchange rate changed (the payment cannot be completed within the parameters of the quote), the receiver closed the connection, or a terminal ILP Reject was encountered, the payment failed permanently. Manual intervention is required to quote and retry the payment, so the state advances to `CANCELLED`.

   After too many recoverable failures and attempts, Rafiki may also consider a payment permanently failed, advancing the state to `CANCELLED`.

3. Recoverable failure. In cases such as an idle timeout, Rafiki may elect to automatically retry the payment. The state remains `SENDING`, but internally tracks that the payment failed and when to schedule another attempt.

### Payment resolution

In the `COMPLETED` and `CANCELLED` cases, the wallet is notifed of any remaining funds in the payment account via `outgoing_payment.completed` and `outgoing_payment.cancelled` [webhook events](#webhooks). Note: if the payment is retried, the same payment account is used for the subsequent attempt.

#### Manual recovery

A payment in the `CANCELLED` state may be explicitly retried ("requoted") by the user. The retry will quote (and eventually attempt to send) the remainder of the payment:

- A `FixedSend` payment will attempt to pay `intent.amountToSend - amountAlreadySent`.
- A `FixedDelivery` payment will attempt to pay the remaining `invoice.amount - invoice.received` (according to the remote invoice state).

## Incoming Payment Lifecycle

### Invoice creation

An invoice is created according to the [Open Payments](https://docs.openpayments.dev/invoices#create) specification. Rafiki creates a payment account for each invoice.

### Receiving

An invoice receives funds via Interledger as long as it is active.

### Deactivation

An invoice is deactivated when either:

- it has received its specified `amount`
- it has expired

When the invoice is deactivated, Rafiki notifies the wallet of received funds via `invoice.paid` or `invoice.expired` [webhook events](#webhooks).

An expired invoice that has never received money is deleted.

## Webhooks

Rafiki sends webhook events to notify the wallet of payment lifecycle states that require liquidity to be added or removed.

Webhook event handlers must be idempotent.

### `EventType`

#### `invoice.expired`

Invoice has expired.

Credit `invoice.received` to the wallet balance for `invoice.accountId` and return `200`.

#### `invoice.paid`

Invoice has received its specified `amount`.

Credit `invoice.received` to the wallet balance for `invoice.accountId` and return `200`.

#### `outgoing_payment.funding`

Payment needs liquidity in order to send quoted amount.

To fund the payment, deduct `quote.maxSourceAmount` from the wallet balance for `payment.accountId` and return `200`.

To cancel the payment, return `403`.

#### `outgoing_payment.cancelled`

Payment was cancelled.

Credit `payment.balance` to the wallet balance for `payment.accountId` and return `200` or `205` to retry the payment.

#### `outgoing_payment.completed`

Payment completed sending the quoted amount.

Credit `payment.balance` to the wallet balance for `payment.accountId` and return `200`.

### Webhook Event

| Name   | Optional | Type                                                           | Description                                       |
| :----- | :------- | :------------------------------------------------------------- | :------------------------------------------------ |
| `id`   | No       | `ID`                                                           | Unique ID of the `data` object.                   |
| `type` | No       | [`EventType`](#eventtype)                                      | Description of the event.                         |
| `data` | No       | [`Invoice`](#invoice) or [`OutgoingPayment`](#outgoingpayment) | Object containing data associated with the event. |

## Resources

### `PaymentIntent`

The intent must include `invoiceUrl` xor (`paymentPointer` and `amountToSend`).

| Name             | Optional | Type      | Description                                                                                                                                                                                                                                                                           |
| :--------------- | :------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `paymentPointer` | Yes      | `String`  | Payment pointer or URL of the destination Open Payments or SPSP account. Requires `amountToSend`.                                                                                                                                                                                     |
| `invoiceUrl`     | Yes      | `String`  | URL of an Open Payments invoice, for a fixed-delivery payment.                                                                                                                                                                                                                        |
| `amountToSend`   | Yes      | `String`  | Fixed amount to send to the recipient, in base units of the sending asset. Requires `paymentPointer`.                                                                                                                                                                                 |
| `autoApprove`    | No       | `Boolean` | If `false`, require manual approval after the quote is complete. If `true`, the wallet may automatically fund the payment after the quote. Note: this should only be used for fixed-source amount payments. Paying invoices without any manual review could send an unbounded amount. |

### `OutgoingPayment`

| Name                             | Optional | Type            | Description                                                                                                                                                                                                                                                                                                              |
| :------------------------------- | :------- | :-------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                             | No       | `ID`            | Unique ID for this payment, randomly generated by Rafiki.                                                                                                                                                                                                                                                                |
| `state`                          | No       | `PaymentState`  | See [`PaymentState`](#paymentstate).                                                                                                                                                                                                                                                                                     |
| `error`                          | Yes      | `String`        | Failure reason.                                                                                                                                                                                                                                                                                                          |
| `stateAttempts`                  | No       | `Integer`       | Retry number at current state.                                                                                                                                                                                                                                                                                           |
| `intent`                         | No       | `PaymentIntent` | See [`PaymentIntent`](#paymentintent).                                                                                                                                                                                                                                                                                   |
| `quote`                          | Yes      | `Object`        | Parameters of payment execution and the projected outcome of a payment.                                                                                                                                                                                                                                                  |
| `quote.timestamp`                | No       | `String`        | Timestamp when the most recent quote for this transaction finished.                                                                                                                                                                                                                                                      |
| `quote.activationDeadline`       | No       | `String`        | Time when this quote expires.                                                                                                                                                                                                                                                                                            |
| `quote.targetType`               | No       | `PaymentType`   | See [`PaymentType`](#paymenttype).                                                                                                                                                                                                                                                                                       |
| `quote.minDeliveryAmount`        | No       | `UInt64`        | Minimum amount that will be delivered if the payment completes, in the base unit and asset of the receiving account. For fixed delivery payments, this will be the remaining amount of the invoice.                                                                                                                      |
| `quote.maxSourceAmount`          | No       | `UInt64`        | Maximum amount that will be sent in the base unit and asset of the sending account. This is intended to be presented to the user or agent before authorizing a fixed delivery payment. For fixed source amount payments, this will be the provided `amountToSend`.                                                       |
| `quote.maxPacketAmount`          | No       | `UInt64`        | Discovered maximum packet amount allowed over this payment path.                                                                                                                                                                                                                                                         |
| `quote.minExchangeRate`          | No       | `Float`         | Aggregate exchange rate the payment is guaranteed to meet, as a ratio of destination base units to source base units. Corresponds to the minimum exchange rate enforced on each packet (_except for the final packet_) to ensure sufficient money gets delivered. For strict bookkeeping, use `maxSourceAmount` instead. |
| `quote.lowExchangeRateEstimate`  | No       | `Float`         | Lower bound of probed exchange rate over the path (inclusive). Ratio of destination base units to source base units.                                                                                                                                                                                                     |
| `quote.highExchangeRateEstimate` | No       | `Float`         | Upper bound of probed exchange rate over the path (exclusive). Ratio of destination base units to source base units.                                                                                                                                                                                                     |
| `accountId`                      | No       | `String`        | Id of the payer's Open Payments account.                                                                                                                                                                                                                                                                                 |
| `destinationAccount`             | No       | `Object`        |                                                                                                                                                                                                                                                                                                                          |
| `destinationAccount.scale`       | No       | `Integer`       |                                                                                                                                                                                                                                                                                                                          |
| `destinationAccount.code`        | No       | `String`        |                                                                                                                                                                                                                                                                                                                          |
| `destinationAccount.url`         | No       | `String`        | URL of the recipient Open Payments/SPSP account (with well-known path, and stripped trailing slash). Each payment pointer and its corresponding account URL identifies a unique payment recipient.                                                                                                                       |
| `outcome`                        | No       | `Object`        | Only set once a payment reaches the sending state. Subsequent attempts add to the totals, and the outcome persists even if a payment attempt fails.                                                                                                                                                                      |
| `outcome.amountSent`             | No       | `UInt64`        | Total amount sent and fulfilled, across all payment attempts, in base units of the source asset.                                                                                                                                                                                                                         |
| `createdAt`                      | No       | `String`        |                                                                                                                                                                                                                                                                                                                          |

### `PaymentState`

- `QUOTING`: Initial state. In this state, an empty payment account is generated, and the payment is automatically resolved & quoted. On success, transition to `FUNDING`. On failure, transition to `CANCELLED`.
- `FUNDING`: Awaiting the wallet to add payment liquidity. If `intent.autoApprove` is not set, the wallet gets user approval before reserving money from the user's wallet account. On success, transition to `SENDING`. Otherwise, transitions to `CANCELLED` if cancelled by the user or when the quote expires.
- `SENDING`: Stream payment from the payment account to the destination.
- `CANCELLED`: The payment failed. (Though some money may have been delivered). Requoting transitions to `QUOTING`.
- `COMPLETED`: Successful completion.

### `PaymentType`

- `FIXED_SEND`: Fixed source amount.
- `FIXED_DELIVERY`: Invoice payment, fixed delivery amount.

### `Invoice`

| Name          | Optional | Type      | Description                                                                                                                    |
| :------------ | :------- | :-------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `id`          | No       | `ID`      | Unique ID for this invoice, randomly generated by Rafiki.                                                                      |
| `accountId`   | No       | `String`  | Id of the recipient's Open Payments account.                                                                                   |
| `amount`      | No       | `UInt64`  | The amount that must be paid at the time the invoice is created, in base units of the account asset.                           |
| `received`    | No       | `UInt64`  | The total amount received, in base units of the account asset.                                                                 |
| `active`      | No       | `Boolean` | If `true`, the invoice may receive funds. If `false`, the invoice is either expired or has already received `amount` of funds. |
| `description` | Yes      | `String`  | Human readable description of the invoice.                                                                                     |
| `createdAt`   | No       | `String`  |                                                                                                                                |
| `expiresAt`   | No       | `String`  |                                                                                                                                |
