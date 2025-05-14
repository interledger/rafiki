## `pay` :money_with_wings:

> Send payments over Interledger using STREAM

[![NPM Package](https://img.shields.io/npm/v/@interledger/pay.svg?style=flat&logo=npm)](https://npmjs.org/package/@interledger/pay)
[![GitHub Actions](https://img.shields.io/github/workflow/status/interledgerjs/interledgerjs/master.svg?style=flat&logo=github)](https://github.com/interledgerjs/interledgerjs/actions?query=workflow%3Amaster)
[![Codecov](https://img.shields.io/codecov/c/github/interledgerjs/interledgerjs/master.svg?logo=codecov&flag=pay)](https://codecov.io/gh/interledgerjs/interledgerjs/tree/master/packages/pay/src)
[![Prettier](https://img.shields.io/badge/code_style-prettier-brightgreen.svg)](https://prettier.io/)

## Install

```bash
npm i @interledger/pay
```

Or using Yarn:

```bash
yarn add @interledger/pay
```

## Guide

### Flow

1. Call **[`setupPayment`](#setuppayment)** to resolve the payment details, destination asset, and/or Incoming Payment
1. Add custom logic before continuing, or catch error
1. Call **[`startQuote`](#startquote)** to probe the exchange rate, discover the max packet amount, and compute payment limits
1. Add custom logic to authorize payment for maximum source amount, or catch error
1. Call **[`pay`](#pay)** to execute the payment
1. Add custom logic to handle payment outcome or error

### Pay an Incoming Payment

> Fixed delivery amount payment

```js
import { setupPayment, startQuote, pay, closeConnection } from '@interledger/pay'

async function run() {
  let plugin /* Plugin instance */

  const destination = await setupPayment({
    plugin,
    destinationPayment:
      'https://mywallet.example/accounts/alice/incoming-payments/04ef492f-94af-488e-8808-3ea95685c992',
  })

  const quote = await startQuote({
    plugin,
    destination,
    sourceAsset: {
      assetCode: 'USD',
      assetScale: 9,
    },
  })
  // {
  //   maxSourceAmount: 1_950n,
  //   lowEstimatedExchangeRate: 115,
  //   highEstimatedExchangeRate: 135,
  //   minExchangeRate: 110,
  // }

  // Verify the max source amount is appropriate and perform or cancel the payment
  const receipt = await pay({ plugin, destination, quote })
  console.log(receipt)
  // {
  //    amountSent: 1_910n,
  //    amountDelivered: BigInt(234_000),
  //    ...
  // }

  await closeConnection(plugin, destination)
}
```

### Pay an Incoming Payment via a Connection URL

> Fixed delivery amount payment

```js
import { setupPayment, startQuote, pay, closeConnection } from '@interledger/pay'

async function run() {
  let plugin /* Plugin instance */

  const destination = await setupPayment({
    plugin,
    destinationConnection: 'https://mywallet.example/bddcc820-c8a1-4a15-b768-95ea2a4ed37b',
  })

  const quote = await startQuote({
    plugin,
    destination,
    sourceAsset: {
      assetCode: 'USD',
      assetScale: 9,
    },
  })
  // {
  //   maxSourceAmount: 1_950n,
  //   lowEstimatedExchangeRate: 115,
  //   highEstimatedExchangeRate: 135,
  //   minExchangeRate: 110,
  // }

  // Verify the max source amount is appropriate and perform or cancel the payment
  const receipt = await pay({ plugin, destination, quote })

  await closeConnection(plugin, destination)
}
```

### Pay to a [Payment Pointer](https://paymentpointers.org/)

> Fixed source amount payment

```js
import { setupPayment, startQuote, pay, closeConnection } from '@interledger/pay'

async function run() {
  let plugin /* Plugin instance */

  const destination = await setupPayment({
    plugin,
    paymentPointer: '$rafiki.money/p/example',
  })

  const quote = await startQuote(
    plugin,
    amountToSend: '314159',
    sourceAmount: {
      assetCode: 'EUR',
      assetScale: 6,
    },
    destination
  })

  const receipt = await pay({ plugin, destination, quote })

  await closeConnection(plugin, destination)
}
```

### Units

[On Interledger assets and denominations](https://interledger.org/rfcs/0038-settlement-engines/#units-and-quantities):

> Asset amounts may be represented using any arbitrary denomination. For example, one U.S. dollar may be represented as \$1 or 100 cents, each of which is equivalent in value. Likewise, one Bitcoin may be represented as 1 BTC or 100,000,000 satoshis.
>
> A **standard unit** is the typical unit of value for a particular asset, such as \$1 in the case of U.S. dollars, or 1 BTC in the case of Bitcoin.
>
> A **fractional unit** represents some unit smaller than the standard unit, but with greater precision. Examples of fractional monetary units include one cent (\$0.01 USD), or 1 satoshi (0.00000001 BTC).
>
> An **asset scale** is the difference in orders of magnitude between the standard unit and a corresponding fractional unit. More formally, the asset scale is a non-negative integer (0, 1, 2, …) such that one standard unit equals the value of `10^(scale)` corresponding fractional units. If the fractional unit equals the standard unit, then the asset scale is 0.
>
> For example, one cent represents an asset scale of 2 in the case of USD, whereas one satoshi represents an asset scale of 8 in the case of Bitcoin.

To simplify accounting, all amounts are represented as unsigned integers in a fractional unit of the asset corresponding to the source asset scale provided, or the destination asset scale resolved from the receiver.

Since applications need to debit the source amount in their own system before executing a payment, this assumes they also know their own source asset and denomination. Therefore, it's not useful to resolve this information dynamically, such as using [IL-DCP](https://interledger.org/rfcs/0031-dynamic-configuration-protocol/), which also delays connection establishment.

### Amounts

Pay leverages JavaScript [`BigInt`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) for arbitrarily large integers using its own wrapper for strongly-typed arithmetic operations.

Amounts returned by Pay use these exported classes and interfaces:

- **[`Int`](https://github.com/interledgerjs/interledgerjs/blob/master/packages/pay/src/utils.ts#L38)** &mdash; Class representing non-negative integers.
- **[`PositiveInt`](https://github.com/interledgerjs/interledgerjs/blob/master/packages/pay/src/utils.ts#L193)** &mdash; Interface narrowing **`Int`**, representing non-negative, non-zero integers. (In this context, zero is not considered signed).
- **[`Ratio`](https://github.com/interledgerjs/interledgerjs/blob/master/packages/pay/src/utils.ts#L234)** &mdash; Class representing a ratio of two integers: a non-negative numerator, and a non-negative, non-zero denominator.
- **[`PositiveRatio`](https://github.com/interledgerjs/interledgerjs/blob/master/packages/pay/src/utils.ts#L326)** &mdash; Interface narrowing **`Ratio`**, representing a ratio of two non-negative, non-zero integers.

**`Int`** and **`Ratio`** offer utility methods for integer operations and comparisons. They may also be converted to/from `number`, `string`, `bigint`, and [`Long`](https://github.com/dcodeIO/Long.js/).

**`Int`** and **`Ratio`** prevent divide-by-zero errors and enforce the internal `bigint` is always non-negative. They also provide type guards for **`PositiveInt`** to reduce unnecessary code paths. For example, if one integer is greater than another, that integer must always be non-zero, and can be safely used as a ratio denominator without any divide-by-zero branch.

### Exchange Rates

Pay is designed to provide strict guarantees of the amount that will be delivered.

During the quote step, the application provides Pay with prices for the source and destination assets and its own acceptable slippage percentage, which Pay uses to calculate a minimum exchange rate and corresponding minimum destination amount it will enforce for the payment. Exchange rates are represented as the ratio between a destination amount and a source amount, in fractional units.

Then, Pay probes the recipient to determine the real exchange rate over that path. If it sufficiently exceeds the minimum exchange rate, Pay will allow the payment to proceed. Otherwise, it's not possible to complete the payment. For instance, connectors may have applied a poor rate or charged too much in fees, the max packet size might be too small to avoid rounding errors, or incorrect assets/scales were provided.

Since STREAM payments are packetized, Pay may not be able to complete a payment if, for instance, the sender and receiver become disconnected during the payment. However, Pay guarantees payments never exhaust their quoted maximum source amount without satisfying their quoted minimum delivery amount. Every delivered packet meets or exceeds the quoted minimum exchange rate (\*with the exception of the final one, as necessary).

### Error Handling

If setup or quoting fails, Pay will reject the Promise with a variant of the **[`PaymentError`](#paymenterror)** enum. For example:

```js
import { setupPayment, PaymentError } from '@interledger/pay'

try {
  await setupPayment({ ... })
} catch (err) {
  if (err === PaymentError.InvalidPaymentPointer) {
    console.log('Payment pointer is invalid!')
  }

  // ...
}
```

Similarly, if an error was encountered during the payment itself, it will include an `error` property on the result which is a **[`PaymentError`](#paymenterror)** variant.

A predicate function, **`isPaymentError`**, is also exported to check if any value is a variant of the enum.

### Payment Pointers

Pay exports the **[`AccountUrl`](https://github.com/interledgerjs/interledgerjs/blob/master/packages/pay/src/payment-pointer.ts#L13)** utility to validate payment pointers and SPSP/Open Payments account URLs. Since payment pointers identify unique Interledger accounts, Pay parses them so they can be compared against external references to the same account.

### Connection Security

Some applications may find it useful for multiple Pay library instances to send over a single STREAM connection, such as quoting in one process, and sending money in another.

In this case, the client application must track key security parameters, such as the request count, which STREAM relies on for monotonically increasing sequence numbers and secure acknowledgements of each request.

Pay uses a **[`Counter`](https://github.com/interledgerjs/interledgerjs/blob/master/packages/pay/src/controllers/sequence.ts#L6)** instance, passed in-process via the **[`ResolvedPayment`](#resolvedpayment)** object, to track how many packets have been sent. Applications that resume connections **MUST** use the counter instance to fetch how many packets have been sent, then create a new counter with the existing request count to pass to new Pay instances that use the same connection.

Other connection invariants applications should enforce:

1. **Only one** Pay instance (any actively running call to `startQuote`, `pay`, or `closeConnection`) can send over a single connection at one time.
1. After a connection is closed via calling `closeConnection`, those connection details may no longer be used for sending.

## API

#### `setupPayment`

> `(options:`**[`SetupOptions`](#setupoptions)**`) => Promise<`**[`ResolvedPayment`](#resolvedpayment)**`>`

Resolve destination details and asset of the payment in order to establish a STREAM connection.

#### `startQuote`

> `(options:`**[`QuoteOptions`](#quoteoptions)**`) => Promise<`**[`Quote`](#quote)**`>`

Perform a rate probe: discover path max packet amount, probe the real exchange rate, and compute the minimum exchange rate and bounds of the payment.

#### `pay`

> `(options:`**[`PayOptions`](#payoptions)**`) => Promise<`**[`PaymentProgress`](#paymentprogress)**`>`

Send the payment: send a series of packets to attempt the payment within the completion criteria and limits of the provided quote.

#### `closeConnection`

> `(plugin:`**[`Plugin`](https://github.com/interledger/rfcs/blob/master/deprecated/0024-ledger-plugin-interface-2/0024-ledger-plugin-interface-2.md)**`, destination:`**[`ResolvedPayment`](#resolvedpayment)**`) => Promise<void>`

If the connection was established, notify receiver to close the connection. For stateless receivers, this may have no effect.

#### `SetupOptions`

> Interface

Parameters to setup and resolve payment details from the recipient.

| Property                                 | Type                                                                                                                                        | Description                                                                                                                                                                                                                                                                                                                                         |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`plugin`**                             | **[`Plugin`](https://github.com/interledger/rfcs/blob/master/deprecated/0024-ledger-plugin-interface-2/0024-ledger-plugin-interface-2.md)** | Plugin to send packets over a connected Interledger network (no receive functionality is necessary). Pay does not call `connect` or `disconnect` on the plugin, so the application must perform that manually.                                                                                                                                      |
| **`destinationAccount`** (_Optional_)    | `string`                                                                                                                                    | SPSP Payment pointer or SPSP account URL to query STREAM connection credentials and exchange asset details. Example: `$rafiki.money/p/alice`. Either **`destinationAccount`** , **`destinationPayment`**, or **`destinationConnection`** must be provided.                                                                                          |
| **`destinationPayment`** (_Optional_)    | `string`                                                                                                                                    | [Open Payments Incoming Payment URL](https://docs.openpayments.guide) to query the details for a fixed-delivery payment. The amount to deliver and destination asset details will automatically be resolved from the Incoming Payment. Either **`destinationAccount`** , **`destinationPayment`**, or **`destinationConnection`** must be provided. |
| **`destinationConnection`** (_Optional_) | `string`                                                                                                                                    | [Open Payments STREAM Connection URL](https://docs.openpayments.guide) to query STREAM connection credentials and exchange asset details for a fixed-delivery payment. Either **`destinationAccount`** , **`destinationPayment`**, or **`destinationConnection`** must be provided.                                                                 |
| **`amountToDeliver`** (_Optional_)       | **[`Amount`](#amount)**                                                                                                                     | Fixed amount of the created Incoming Payment, in base units of the destination asset. <br><br>Note: this option requires the destination asset to be known in advance. The application must ensure the destination asset resolved via STREAM is the expected asset and denomination.                                                                |

#### `ResolvedPayment`

> Interface

Resolved destination details of a proposed payment, such as the destination asset, Incoming Payment, and STREAM credentials, ready to perform a quote.

| Property                                     | Type                                                                                                                    | Description                                                                                                                                                                                                                                                                                            |
| :------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`destinationAsset`**                       | **[`AssetDetails`](#assetdetails)**                                                                                     | Destination asset and denomination, resolved using Open Payments or STREAM, or provided directly.                                                                                                                                                                                                      |
| **`destinationAddress`**                     | `string`                                                                                                                | ILP address of the destination STREAM recipient, uniquely identifying this connection.                                                                                                                                                                                                                 |
| **`sharedSecret`**                           | `Uint8Array`                                                                                                            | 32-byte seed to derive keys to encrypt STREAM messages and generate ILP packet fulfillments.                                                                                                                                                                                                           |
| **`destinationPaymentDetails`** (_Optional_) | **[`IncomingPayment`](#incomingpayment)**                                                                               | Open Payments Incoming Payment metadata, if the payment pays into an Incoming Payment.                                                                                                                                                                                                                 |
| **`accountUrl`** (_Optional_)                | `string`                                                                                                                | URL of the recipient Open Payments/SPSP account (with well-known path, and stripped trailing slash). Each payment pointer and its corresponding account URL identifies a unique payment recipient. Not applicable if Open Payments STREAM Connection URL or STREAM credentials were provided directly. |
| **`destinationAccount`** (_Optional_)        | `string`                                                                                                                | Payment pointer, prefixed with "\$", corresponding to the recipient Open Payments/SPSP account. Each payment pointer and its corresponding account URL identifies a unique payment recipient. Not applicable if STREAM credentials were provided directly.                                             |
| **`requestCounter`**                         | **[`Counter`](https://github.com/interledgerjs/interledgerjs/blob/master/packages/pay/src/controllers/sequence.ts#L6)** | Strict counter of how many packets have been sent, to safely resume a connection                                                                                                                                                                                                                       |

#### `QuoteOptions`

> Interface

Limits and target to quote a payment and probe the rate.

| Property                           | Type                                                                                                                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`plugin`**                       | **[`Plugin`](https://github.com/interledger/rfcs/blob/master/deprecated/0024-ledger-plugin-interface-2/0024-ledger-plugin-interface-2.md)** | Plugin to send packets over a connected Interledger network (no receive functionality is necessary). Pay does not call `connect` or `disconnect` on the plugin, so the application must perform that manually.                                                                                                                                                                                                                                                                 |
| **`destination`**                  | **[`ResolvedPayment`](#resolvedpayment)**                                                                                                   | Resolved destination details of the payment, including the asset, Incoming Payment, and connection establishment information.                                                                                                                                                                                                                                                                                                                                                  |
| **`sourceAsset`** (_Optional_)     | **[`AssetDetails`](#assetdetails)**                                                                                                         | Source asset and denomination for the sender. Required to compute the minimum exchange rate, unless slippage is 100%.                                                                                                                                                                                                                                                                                                                                                          |
| **`amountToSend`** (_Optional_)    | `string`, `number`, `bigint` or **[`Int`](#amounts)**                                                                                       | Fixed amount to send to the recipient, in base units of the sending asset. Either **`amountToSend`**, **`amountToDeliver`**, or **`destinationPayment`** must be provided, in order to determine how much to pay.                                                                                                                                                                                                                                                              |
| **`amountToDeliver`** (_Optional_) | `string`, `number`, `bigint` or **[`Int`](#amounts)**                                                                                       | Fixed amount to deliver to the recipient, in base units of the destination asset. **`destinationPayment`** is recommended method to send fixed delivery payments, but this option enables sending a fixed-delivery payment to an SPSP server that doesn't support Open Payments.<br><br>Note: this option requires the destination asset to be known in advance. The application must ensure the destination asset resolved via STREAM is the expected asset and denomination. |
| **`prices`** (_Optional_)          | `{ [string]: number }`                                                                                                                      | Object of asset codes to prices in a standardized base asset to compute exchange rates. For example, using U.S. dollars as a base asset: `{ USD: 1, EUR: 1.09, BTC: 8806.94 }`.<br><br>If the source and destination assets are the same, a 1:1 rate will be used as the basis, so **`prices`** doesn't need to be provided. It may also be omitted if the slippage is set to 100%, since no minimum exchange rates will be enforced.                                          |
| **`slippage`** (_Optional_)        | `number`                                                                                                                                    | Percentage to subtract from the external exchange rate to determine the minimum acceptable exchange rate and destination amount for each packet, between `0` and `1` (inclusive). Defaults to `0.01`, or 1% slippage below the exchange rate computed from the given **`prices`**.<br><br>If `1` is provided for a fixed source amount payment, no minimum exchange rate will be enforced. For fixed delivery payments, slippage cannot be 100%.                               |

#### `Quote`

> Interface

Parameters of payment execution and the projected outcome of a payment.

| Property                        | Type                              | Description                                                                                                                                                                                                                                                                                                              |
| :------------------------------ | :-------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`paymentType`**               | **[`PaymentType`](#paymenttype)** | The completion criteria of the payment. For fixed source amount payments, `"FixedSend"`; for Incoming Payments and fixed delivery payments, `"FixedDelivery"`.                                                                                                                                                           |
| **`maxSourceAmount`**           | `bigint`                          | Maximum amount that will be sent in the base unit and asset of the sending account. This is intended to be presented to the user or agent before authorizing a fixed delivery payment. For fixed source amount payments, this will be the provided **`amountToSend`**.                                                   |
| **`minDeliveryAmount`**         | `bigint`                          | Minimum amount that will be delivered if the payment completes, in the base unit and asset of the receiving account. For fixed delivery payments, this will be the provided **`amountToDeliver`** or amount of the Incoming Payment.                                                                                     |
| **`maxPacketAmount`**           | `bigint`                          | Discovered maximum packet amount allowed over this payment path.                                                                                                                                                                                                                                                         |
| **`minExchangeRate`**           | **[`Ratio`](#amounts)**           | Aggregate exchange rate the payment is guaranteed to meet, as a ratio of destination base units to source base units. Corresponds to the minimum exchange rate enforced on each packet (\*except for the final packet) to ensure sufficient money gets delivered. For strict bookkeeping, use `maxSourceAmount` instead. |
| **`lowEstimatedExchangeRate`**  | **[`Ratio`](#amounts)**           | Lower bound of probed exchange rate over the path (inclusive). Ratio of destination base units to source base units                                                                                                                                                                                                      |
| **`highEstimatedExchangeRate`** | **[`Ratio`](#amounts)**           | Upper bound of probed exchange rate over the path (exclusive). Ratio of destination base units to source base units                                                                                                                                                                                                      |

#### `PayOptions`

> Interface

Payment execution parameters.

| Property                           | Type                                                                                                                                        | Description                                                                                                                                                                                                                         |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`plugin`**                       | **[`Plugin`](https://github.com/interledger/rfcs/blob/master/deprecated/0024-ledger-plugin-interface-2/0024-ledger-plugin-interface-2.md)** | Plugin to send packets over a connected Interledger network (no receive functionality is necessary). Pay does not call `connect` or `disconnect` on the plugin, so the application must perform that manually.                      |
| **`destination`**                  | **[`ResolvedPayment`](#resolvedpayment)**                                                                                                   | Resolved destination details of the payment, including the asset, Incoming Payment, and connection establishment information.                                                                                                       |
| **`quote`**                        | **[`Quote`](#quote)**                                                                                                                       | Parameters and rates to enforce during payment execution.                                                                                                                                                                           |
| **`progressHandler`** (_Optional_) | `(progress:`**[`PaymentProgress`](#paymentprogress)**`) => void`                                                                            | Callback to process streaming updates as packets are sent and received, such as to perform accounting while the payment is in progress. Handler will be called for all fulfillable packets and replies before the payment resolves. |

#### `PaymentProgress`

> Interface

Intermediate state or outcome of the payment, to account for sent/delivered amounts. If the payment failed, the **`error`** property is included.

| Property                         | Type                              | Description                                                                                                                       |
| :------------------------------- | :-------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| **`error`** (_Optional_)         | **[PaymentError](#paymenterror)** | Error state, if the payment failed.                                                                                               |
| **`amountSent`**                 | `bigint`                          | Amount sent and fulfilled, in base units of the source asset.                                                                     |
| **`amountDelivered`**            | `bigint`                          | Amount delivered to the recipient, in base units of the destination asset.                                                        |
| **`sourceAmountInFlight`**       | `bigint`                          | Amount sent that is yet to be fulfilled or rejected, in base units of the source asset.                                           |
| **`destinationAmountInFlight`**  | `bigint`                          | Estimate of the amount that may be delivered from in-flight packets, in base units of the destination asset.                      |
| **`streamReceipt`** (_Optional_) | `Uint8Array`                      | Latest [STREAM receipt](https://interledger.org/rfcs/0039-stream-receipts/) to provide proof-of-delivery to a 3rd party verifier. |

#### `IncomingPayment`

> Interface

[Open Payments Incoming Payment](https://docs.openpayments.guide) metadata

| Property             | Type                               | Description                                                                                                                                                                                                                               |
| :------------------- | :--------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`id`**             | `string`                           | URL used to query and identify the Incoming Payment.                                                                                                                                                                                      |
| **`paymentPointer`** | `string`                           | URL of the recipient Open Payments account to which incoming payments will be credited (with well-known path, and stripped trailing slash). Each payment pointer and its corresponding `paymentPointer` identifies a unique payment recipient. |
| **`completed`**      | `boolean`                          | Describes whether the Incoming Payment has completed receiving funds.                                                                                                                                                                     |
| **`incomingAmount`** | **[`Amount`](#amount)** (Optional) | Fixed destination amount that must be delivered to complete payment of the Incoming Payment.                                                                                                                                              |
| **`receivedAmount`** | **[`Amount`](#amount)**            | Amount that has already been paid toward the Incoming Payment.                                                                                                                                                                            |
| **`expiresAt`**      | `number` (Optional)                | UNIX timestamp in milliseconds after which payments toward the Incoming Payment will no longer be accepted.                                                                                                                               |
| **`description`**    | `string` (Optional)                | Human-readable description of what is provided in return for completion of the Incoming Payment.                                                                                                                                          |
| **`externalRef`**    | `string` (Optional)                | Human-readable external reference that can be used by external systems to reconcile this payment with outside systems.                                                                                                                    |

#### `Amount`

> Interface

Amount details of an [`IncomingPayment`](#incomingpayment).

| Property         | Type     | Description                                                                         |
| :--------------- | :------- | :---------------------------------------------------------------------------------- |
| **`value`**      | `bigint` | Amount, in base units.                                                              |
| **`assetScale`** | `number` | Precision of the asset denomination: number of decimal places of the ordinary unit. |
| **`assetCode`**  | `string` | Asset code or symbol identifying the currency of the account.                       |

#### `AssetDetails`

> Interface

Asset and denomination for an Interledger account (source or destination asset)

| Property    | Type     | Description                                                                         |
| :---------- | :------- | :---------------------------------------------------------------------------------- |
| **`scale`** | `number` | Precision of the asset denomination: number of decimal places of the ordinary unit. |
| **`code`**  | `string` | Asset code or symbol identifying the currency of the account.                       |

#### `PaymentType`

> String enum

Completion criteria of the payment

| Variant             | Description                                                                  |
| :------------------ | :--------------------------------------------------------------------------- |
| **`FixedSend`**     | Send up to a maximum source amount                                           |
| **`FixedDelivery`** | Send to meet a minimum delivery amount, bounding the source amount and rates |

#### `PaymentError`

> String enum

Payment error states

##### Errors likely caused by the user

| Variant                        | Description                                                        |
| :----------------------------- | :----------------------------------------------------------------- |
| **`InvalidPaymentPointer`**    | Payment pointer or SPSP URL is syntactically invalid               |
| **`InvalidCredentials`**       | No valid STREAM credentials or URL to fetch them was provided      |
| **`InvalidSlippage`**          | Slippage percentage is not between 0 and 1 (inclusive)             |
| **`UnknownSourceAsset`**       | Source asset or denomination was not provided                      |
| **`UnknownPaymentTarget`**     | No fixed source amount or fixed destination amount was provided    |
| **`InvalidSourceAmount`**      | Fixed source amount is not a positive integer                      |
| **`InvalidDestinationAmount`** | Fixed delivery amount is not a positive integer                    |
| **`UnenforceableDelivery`**    | Minimum exchange rate of 0 cannot enforce a fixed-delivery payment |

##### Errors likely caused by the receiver, connectors, or other externalities

| Variant                         | Description                                                                                          |
| :------------------------------ | :--------------------------------------------------------------------------------------------------- |
| **`QueryFailed`**               | Failed to query the Open Payments or SPSP server, or received an invalid response                    |
| **`IncomingPaymentCompleted`**  | Incoming payment was already completed by the Open Payments server, so no payment is necessary       |
| **`IncomingPaymentExpired`**    | Incoming payment has already expired, so no payment is possible                                      |
| **`ConnectorError`**            | Cannot send over this path due to an ILP Reject error                                                |
| **`EstablishmentFailed`**       | No authentic reply from receiver: packets may not have been delivered                                |
| **`UnknownDestinationAsset`**   | Destination asset details are unknown or the receiver never provided them                            |
| **`DestinationAssetConflict`**  | Receiver sent conflicting destination asset details                                                  |
| **`ExternalRateUnavailable`**   | Failed to compute minimum rate: prices for source or destination assets were invalid or not provided |
| **`RateProbeFailed`**           | Rate probe failed to establish the exchange rate or discover path max packet amount                  |
| **`InsufficientExchangeRate`**  | Real exchange rate is less than minimum exchange rate with slippage                                  |
| **`IdleTimeout`**               | No packets were fulfilled within timeout                                                             |
| **`ClosedByReceiver`**          | Receiver closed the connection or stream, terminating the payment                                    |
| **`IncompatibleReceiveMax`**    | Estimated destination amount exceeds the receiver's limit                                            |
| **`ReceiverProtocolViolation`** | Receiver violated the STREAM protocol, misrepresenting delivered amounts                             |
| **`MaxSafeEncryptionLimit`**    | Encrypted maximum number of packets using the key for this connection                                |
