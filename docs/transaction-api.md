# Transaction API

## Lifecycle

### Payment creation

A user creates a payment by passing a `PaymentIntent` to `Mutation.createOutgoingPayment`. If the payment destination (the payment pointer or invoice URL) is successfully resolved, the payment is created in the `Inactive` state.

If the payment destination cannot be resolved, no payment is created and the query returns an error.

### Quoting

To begin a payment attempt, an instance acquires a lock to setup and quote the payment, advancing it from `Inactive` to the `Ready` state.

First, the recipient Open Payments account or invoice is resolved. Then, the STREAM sender quotes the payment to probe the exchange rate, compute a minimum rate, and discover the path maximum packet amount.

Quotes can end in 3 states:

1. Success. The STREAM sender successfully established a connection to the recipient, and discovered rates and the path capacity. This advances the state to `Ready`. The parameters of the quote are persisted so they may be resumed if the payment is approved. Rafiki also assigns a deadline based on the expected validity of its slippage parameters for the user to authorize the payment.
2. Irrevocable failure. In cases such as if the payment pointer or account URL was semantically invalid, the invoice was already paid, a terminal ILP Reject was encountered, or the rate was insufficient, the payment is unlikely to ever succeed, or requires some manual intervention. These cases advance the state to `Cancelling`.
3. Recoverable failure. In the case of some transient errors, such as if the Open Payments HTTP query failed, the quote couldn't complete within the timeout, or no external exchange rate was available, Rafiki may elect to automatically retry the quote. This returns the state to `Inactive`, but internally tracks that the quote failed and when to schedule another attempt.

After the quote ends and state advances, the lock on the payment is released.

### Authorization

If the payment intent did not specify `autoApprove` of `true`, a client must manually approve the payment, based on the parameters of the quote, before Rafiki may execute it.

This step is necessary so the end user can precisely know the maximum amount of source units that will leave their account. Typically, the payment application will present these parameters in the user interface before the user elects to approve the payment. This step is particularly important for invoices, to prevent an unbounded sum from leaving the user's account. During this step, the user may also be presented with additional information about the payment, such as details of the payment recipient, or how much is expected to be delivered.

Authorization ends in two possible states:

1. Activation. If the user approves the payment before its activation deadline, or `autoApprove` was `true`, the state advances to `Activated`.

   In this case, Rafiki creates a new Interledger sub-account of the funding account, that is, the top-level Interledger account owned by the payer.

   Then, Rafiki extends and utilizes a trustline to the sub-account for the `maxSourceAmount` of the quote, reserving the maximum requisite funds for the payment into the sub-account.

2. Cancellation. If the user explicitly cancels the quote, or the activation deadline is exceeded, the state advances to `Cancelling`. In the latter case, too much time has elapsed for the enforced exchange rate to remain accurate.

### Payment execution

An instance acquires a lock on a payment with an `Activated` state and advances it to `Sending`. The STREAM will use the quote parameters acquired during the `Inactive` state.

The instance connects to the Interledger sub-account it created via ILP-over-HTTP, and sends the payment with STREAM.

After the payment completes, the instance releases the lock on the payment and advances the state depending upon the outcome:

1. Success. If the STREAM sender successfully fulfilled the completion criteria of the payment, sending or delivering the requisite amount, the payment is complete. The instance advances the state to `Completed`, the final state of the payment.
2. Irrevocable failure. In cases such as if the exchange rate changed (the payment cannot be completed within the parameters of the quote), the receiver closed the connection, or a terminal ILP Reject was encountered, the payment failed permanently. Manual intervention is required to quote and retry the payment, so the state advances to `Cancelling`.

   After too many recoverable failures and attempts, Rafiki may also consider a payment permanently failed, advancing the state to `Cancelling`.

3. Recoverable failure. In cases such as an idle timeout, Rafiki may elect to automatically retry the payment. The state remains `Sending`, but internally tracks that the payment failed and when to schedule another attempt.

In the `Completed` and `Cancelled` cases, remaining funds in the Interledger sub-account are returned to the funding account and the trustline is not replenished. Note: if the payment is retried, the same Interledger sub-account is used for the subsequent attempt.

### Manual recovery

A payment in the `Cancelled` state may be explicitly retried ("requoted") by the user. The retry will quote (and eventually attempt to send) the remainder of the payment:

- A `FixedSend` payment will attempt to pay `intent.amountToSend - amountAlreadySent`.
- A `FixedDelivery` payment will attempt to pay the remaining `invoice.amount - invoice.received` (according to the remote invoice state).

## Resources
### `PaymentIntent`

The intent must include `invoiceUrl` xor (`paymentPointer` and `amountToSend`).

| Name             | Optional | Type           | Description                                                 |
| :--------------- | :------- | :--------------| :---------------------------------------------------------- |
| `paymentPointer` | Yes      | `String`       | Payment pointer or URL of the destination Open Payments or SPSP account. Requires `amountToSend`. |
| `invoiceUrl`     | Yes      | `String`       | URL of an Open Payments invoice, for a fixed-delivery payment. |
| `amountToSend`   | Yes      | `String`       | Fixed amount to send to the recipient, in base units of the sending asset. Requires `paymentPointer`. |
| `autoApprove`    | No       | `Boolean`      | If `false`, require manual approval after the quote is complete. If `true`, automatically activates and begins execution of the payment after the quote. Note: this should only be used for fixed-source amount payments. Paying invoices without any manual review could send an unbounded amount. |

### `OutgoingPayment`

| Name                             | Optional | Type           | Description                                                 |
| :------------------------------- | :------- | :--------------| :---------------------------------------------------------- |
| `id`                             | No       | `ID`           | Unique ID for this account, randomly generated by Rafiki.   |
| `state`                          | No       | `PaymentState` | See [`PaymentState`](#paymentstate).                        |
| `error`                          | Yes      | `String`       | Failure reason.                                             |
| `stateAttempts`                  | No       | `Integer`      | Retry number at current state.                              |
| `intent.paymentPointer`          | Yes      | `String`       | Payment pointer or URL of the destination Open Payments or SPSP account. Requires `amountToSend`. |
| `intent.invoiceUrl`              | Yes      | `String`       | URL of an Open Payments invoice, for a fixed-delivery payment. |
| `intent.amountToSend`            | Yes      | `String`       | Fixed amount to send to the recipient, in base units of the sending asset. Requires `paymentPointer`. |
| `intent.autoApprove`             | No       | `Boolean`      | If `false`, require manual approval after the quote is complete. If `true`, automatically activates and begins execution of the payment after the quote. Note: this should only be used for fixed-source amount payments. Paying invoices without any manual review could send an unbounded amount. |
| `quote`                          | Yes      | `Object`       | Parameters of payment execution and the projected outcome of a payment. |
| `quote.timestamp`                | No       | `String`       | Timestamp when the most recent quote for this transaction finished. |
| `quote.activationDeadline`       | No       | `String`       | Time when this quote expires.                               |
| `quote.targetType`               | No       | `PaymentType`  | See [`PaymentType`](#paymenttype).                          |
| `quote.minDeliveryAmount`        | No       | `UInt64`       | Minimum amount that will be delivered if the payment completes, in the base unit and asset of the receiving account. For fixed delivery payments, this will be the provided `amountToDeliver` or amount of the invoice. |
| `quote.maxSourceAmount`          | No       | `UInt64`       | Maximum amount that will be sent in the base unit and asset of the sending account. This is intended to be presented to the user or agent before authorizing a fixed delivery payment. For fixed source amount payments, this will be the provided `amountToSend`. |
| `quote.maxPacketAmount`          | No       | `UInt64`       | Discovered maximum packet amount allowed over this payment path. |
| `quote.minExchangeRate`          | No       | `Float`        | Aggregate exchange rate the payment is guaranteed to meet, as a ratio of destination base units to source base units. Corresponds to the minimum exchange rate enforced on each packet (*except for the final packet*) to ensure sufficient money gets delivered. For strict bookkeeping, use `maxSourceAmount` instead. |
| `quote.lowExchangeRateEstimate`  | No       | `Float`        | Lower bound of probed exchange rate over the path (inclusive). Ratio of destination base units to source base units. |
| `quote.highExchangeRateEstimate` | No       | `Float`        | Upper bound of probed exchange rate over the path (exclusive). Ratio of destination base units to source base units. |
| `sourceAccount`                  | No       | `Object`       |                                                             |
| `sourceAccount.id`               | No       | `String`       | Account id of the payment's sender.                         |
| `sourceAccount.scale`            | No       | `Integer`      |                                                             |
| `sourceAccount.code`             | No       | `String`       |                                                             |
| `destinationAccount`             | No       | `Object`       |                                                             |
| `destinationAccount.scale`       | No       | `Integer`      |                                                             |
| `destinationAccount.code`        | No       | `String`       |                                                             |
| `destinationAccount.url`         | No       | `String`       | URL of the recipient Open Payments/SPSP account (with well-known path, and stripped trailing slash). Each payment pointer and its corresponding account URL identifies a unique payment recipient. |
| `outcome`                        | No       | `Object`       | Only set once a payment reaches the sending state. Subsequent attempts add to the totals, and the outcome persists even if a payment attempt fails. |
| `outcome.amountSent`             | No       | `UInt64`       | Total amount sent and fulfilled, across all payment attempts, in base units of the source asset. |
| `createdAt`                      | No       | `String`       |                                                             |

### `PaymentState`

- `INACTIVE`: Initial state. In this state, an empty trustline account is generated, and the payment is automatically resolved & quoted. On success, transition to `Ready`. On failure, transition to `Cancelling`.
- `READY`: Awaiting user approval. Approval is automatic if `intent.autoApprove` is set. Once approved, transitions to `Activated`.
- `ACTIVATED`: During activation, money from the user's main account is moved to the payment account to reserve it. On success, transition to `Sending`.
- `SENDING`: Stream payment from the payment account to the destination.
- `CANCELLING`: Transitions to Cancelled once leftover reserved money is refunded to the user's main account.
- `CANCELLED`: The payment failed. (Though some money may have been delivered). Requoting transitions to `Inactive`.
- `COMPLETED`: Successful completion.

### `PaymentType`

- `FIXED_SEND`: Fixed source amount.
- `FIXED_DELIVERY`: Invoice payment, fixed delivery amount.

