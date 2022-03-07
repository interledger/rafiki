# Transaction API

## Outgoing Payment Lifecycle

### Payment creation

A user creates a payment by passing a `PaymentIntent` to `Mutation.createOutgoingPayment`. The payment is created in the `PENDING` state.

### Quoting

To begin a payment attempt, an instance acquires a lock to setup and quote the payment, advancing it from `PENDING` to the `PREPARED` state.

First, the recipient Open Payments account or incoming payment is resolved. Then, the STREAM sender quotes the payment to probe the exchange rate, compute a minimum rate, and discover the path maximum packet amount.

Quotes can end in 3 states:

1. Success. The STREAM sender successfully established a connection to the recipient, and discovered rates and the path capacity. This advances the state to `PREPARED`. The parameters of the quote are persisted so they may be resumed if the payment is funded. Rafiki also assigns a deadline based on the expected validity of its slippage parameters for the wallet to fund the payment.
2. Irrevocable failure. In cases such as if the payment pointer or account URL was semantically invalid, the incoming payment was already paid, a terminal ILP Reject was encountered, or the rate was insufficient, the payment is unlikely to ever succeed, or requires some manual intervention. These cases advance the state to `FAILED`.
3. Recoverable failure. In the case of some transient errors, such as if the Open Payments HTTP query failed, the quote couldn't complete within the timeout, or no external exchange rate was available, Rafiki may elect to automatically retry the quote. This returns the state to `PENDING`, but internally tracks that the quote failed and when to schedule another attempt.

After the quote ends and state advances, the lock on the payment is released.

### Authorization

If the payment was not created with `authorized` set to `true`, a client must manually authorize the payment, based on the parameters of the quote, before the payment can be processed.

This step is necessary so the end user can precisely know the maximum amount of source units that will leave their account. Typically, the payment application will present these parameters in the user interface before the user elects to approve the payment. This step is particularly important when paying to Open Payments incoming payments, to prevent an unbounded sum from leaving the user's account. During this step, the user may also be presented with additional information about the payment, such as details of the payment recipient, or how much is expected to be delivered.

Authorization ends in two possible states:

1. Authorized. If the user approves the payment before its authorization deadline, the state advances to `FUNDING`.

2. Expired. If the authorization deadline is exceeded, the state advances to `EXPIRED`. Too much time has elapsed for the enforced exchange rate to remain accurate.

### Funding

After quoting completes and the payment is authorized, Rafiki notifies the wallet operator via an `outgoing_payment.funding` [webhook event](#webhooks) to reserve the maximum requisite funds for the payment attempt by moving `maxSourceAmount` of the quote from the funding wallet account owned by the payer to the payment account.

If the wallet funds the payment, the state advances to `SENDING`.

### Payment execution

To send, an instance acquires a lock on a payment with a `SENDING` state.

The instance sends the payment with STREAM, which uses the quote parameters acquired during the `PENDING` state.

After the payment completes, the instance releases the lock on the payment and advances the state depending upon the outcome:

1. Success. If the STREAM sender successfully fulfilled the completion criteria of the payment, sending or delivering the requisite amount, the payment is complete. The instance advances the state to `COMPLETED`, the final state of the payment.
2. Irrevocable failure. In cases such as if the exchange rate changed (the payment cannot be completed within the parameters of the quote), the payment failed permanently, and the state advances to `FAILED`.

   After too many recoverable failures and attempts, Rafiki may also consider a payment permanently failed, advancing the state to `FAILED`.

3. Recoverable failure. Rafiki may elect to automatically retry the payment. The state remains `SENDING`, but internally tracks that the payment failed and when to schedule another attempt. Includes cases such as:
   - an idle timeout
   - the receiver closed the connection
   - a terminal ILP Reject was encountered

### Payment resolution

In the `COMPLETED` and `FAILED` cases, the wallet is notifed of any remaining funds in the payment account via `outgoing_payment.completed` and `outgoing_payment.cancelled` [webhook events](#webhooks).

#### Manual recovery

A payment in the `EXPIRED` state may be explicitly retried ("requoted") by the user and returned to the `PENDING`. The retry will quote (and eventually attempt to send) the payment. The payment will still need to be authorized before it is funded or sent. (An `EXPIRED` payment was never previously authorized.)

## Incoming Payment Lifecycle

### Incoming payment creation

An incoming payment is created according to the [Open Payments](https://docs.openpayments.guide/reference/create-incoming-payment) specification. Rafiki creates a payment account for each incoming payment.

### Receiving

An incoming payment receives funds via Interledger as long as it is active.

### Deactivation

An incoming payment is deactivated when either:

- it has received its specified `amount`
- it has expired

When the incoming payment is deactivated, Rafiki notifies the wallet of received funds via `incoming_payment.paid` or `incoming_payment.expired` [webhook events](#webhooks).

An expired incoming payment that has never received money is deleted.

## Webhooks

Rafiki sends webhook events to notify the wallet of payment lifecycle states that require liquidity to be added or removed.

Webhook event handlers must be idempotent and return `200` on success. Rafiki will retry unsuccessful webhook requests for up to one day.

### `EventType`

#### `account.web_monetization`

Account has web monetization balance to be withdrawn.

Credit `account.received` to the wallet balance for `account.id`, and call `Mutation.withdrawEventLiquidity` with the event id.

#### `incoming_payment.expired`

Incoming payment has expired.

Credit `incomingPayment.received` to the wallet balance for `incomingPayment.accountId`, and call `Mutation.withdrawEventLiquidity` with the event id.

#### `incoming_payment.paid`

Incoming payment has received its specified `amount`.

Credit `incomingPayment.received` to the wallet balance for `incomingPayment.accountId`, and call `Mutation.withdrawEventLiquidity` with the event id.

#### `outgoing_payment.funding`

Payment needs liquidity in order to send quoted amount.

To fund the payment, deduct `quote.maxSourceAmount` from the wallet balance for `payment.accountId` and call `Mutation.depositEventLiquidity` with the event id.

#### `outgoing_payment.failed`

Payment failed.

Credit `payment.balance` to the wallet balance for `payment.accountId`, and call `Mutation.withdrawEventLiquidity` with the event id.

#### `outgoing_payment.completed`

Payment completed sending the quoted amount.

Credit `payment.balance` to the wallet balance for `payment.accountId`, and call `Mutation.withdrawEventLiquidity` with the event id.

### Webhook Event

| Name   | Optional | Type                                                                                                  | Description                                       |
| :----- | :------- | :---------------------------------------------------------------------------------------------------- | :------------------------------------------------ |
| `id`   | No       | `ID`                                                                                                  | Unique ID of the webhook event.                   |
| `type` | No       | [`EventType`](#eventtype)                                                                             | Description of the event.                         |
| `data` | No       | [`Account`](#account), [`IncomingPayment`](#incomingpayment) or [`OutgoingPayment`](#outgoingpayment) | Object containing data associated with the event. |

## Resources

### `PaymentIntent`

The intent must include `incomingPaymentUrl` xor (`paymentPointer` and `amountToSend`).

| Name                 | Optional | Type     | Description                                                                                           |
| :------------------- | :------- | :------- | :---------------------------------------------------------------------------------------------------- |
| `paymentPointer`     | Yes      | `String` | Payment pointer or URL of the destination Open Payments or SPSP account. Requires `amountToSend`.     |
| `incomingPaymentUrl` | Yes      | `String` | URL of an Open Payments incoming payment, for a fixed-delivery payment.                               |
| `amountToSend`       | Yes      | `String` | Fixed amount to send to the recipient, in base units of the sending asset. Requires `paymentPointer`. |

### `OutgoingPayment`

| Name                             | Optional | Type            | Description                                                                                                                                                                                                                                                                                                              |
| :------------------------------- | :------- | :-------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                             | No       | `ID`            | Unique ID for this payment, randomly generated by Rafiki.                                                                                                                                                                                                                                                                |
| `state`                          | No       | `PaymentState`  | See [`PaymentState`](#paymentstate).                                                                                                                                                                                                                                                                                     |
| `authorized`                     | No       | `Boolean`       |                                                                                                                                                                                                                                                                                                                          |
| `error`                          | Yes      | `String`        | Failure reason.                                                                                                                                                                                                                                                                                                          |
| `stateAttempts`                  | No       | `Integer`       | Retry number at current state.                                                                                                                                                                                                                                                                                           |
| `intent`                         | No       | `PaymentIntent` | See [`PaymentIntent`](#paymentintent).                                                                                                                                                                                                                                                                                   |
| `quote`                          | Yes      | `Object`        | Parameters of payment execution and the projected outcome of a payment.                                                                                                                                                                                                                                                  |
| `quote.timestamp`                | No       | `String`        | Timestamp when the most recent quote for this transaction finished.                                                                                                                                                                                                                                                      |
| `quote.activationDeadline`       | No       | `String`        | Time when this quote expires.                                                                                                                                                                                                                                                                                            |
| `quote.targetType`               | No       | `PaymentType`   | See [`PaymentType`](#paymenttype).                                                                                                                                                                                                                                                                                       |
| `quote.minDeliveryAmount`        | No       | `UInt64`        | Minimum amount that will be delivered if the payment completes, in the base unit and asset of the receiving account. For fixed delivery payments, this will be the remaining amount of the incoming payment.                                                                                                             |
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

- `PENDING`: Initial state. In this state, an empty payment account is generated, and the payment is automatically resolved & quoted. On success, transition to `PREPARED` or `FUNDING` if already authorized. On failure, transition to `FAILED`.
- `PREPARED`: On authorization, transition to `FUNDING`. Otherwise, transition to `EXPIRED` when the quote expires.
- `FUNDING`: Awaiting the wallet to add payment liquidity. If `intent.autoApprove` is not set, the wallet gets user approval before reserving money from the user's wallet account. On success, transition to `SENDING`.
- `SENDING`: Stream payment from the payment account to the destination.
- `EXPIRED`: The quote expired. Requoting transitions to `PENDING`.
- `FAILED`: The payment failed. (Though some money may have been delivered)
- `COMPLETED`: Successful completion.

### `PaymentType`

- `FIXED_SEND`: Fixed source amount.
- `FIXED_DELIVERY`: Incoming payment, fixed delivery amount.

### `Incoming Payment`

| Name          | Optional | Type     | Description                                                                                                   |
| :------------ | :------- | :------- | :------------------------------------------------------------------------------------------------------------ |
| `id`          | No       | `ID`     | Unique ID for this incoming payment, randomly generated by Rafiki.                                            |
| `accountId`   | No       | `String` | Id of the recipient's Open Payments account.                                                                  |
| `amount`      | No       | `UInt64` | The amount that must be paid at the time the incoming payment is created, in base units of the account asset. |
| `received`    | No       | `UInt64` | The total amount received, in base units of the account asset.                                                |
| `description` | Yes      | `String` | Human readable description of the incoming payment.                                                           |
| `createdAt`   | No       | `String` |                                                                                                               |
| `expiresAt`   | No       | `String` |                                                                                                               |

### `Account`

| Name        | Optional | Type     | Description                                               |
| :---------- | :------- | :------- | :-------------------------------------------------------- |
| `id`        | No       | `ID`     | Unique ID for this account, randomly generated by Rafiki. |
| `received`  | No       | `UInt64` | The amount received, in base units of the account asset.  |
| `createdAt` | No       | `String` |                                                           |
