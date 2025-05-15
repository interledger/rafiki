## `stream-receiver` :moneybag:

> Simple & composable stateless STREAM receiver

[![NPM Package](https://img.shields.io/npm/v/@interledger/stream-receiver.svg?style=flat&logo=npm)](https://npmjs.org/package/@interledger/stream-receiver)
[![GitHub Actions](https://img.shields.io/github/workflow/status/interledgerjs/interledgerjs/master.svg?style=flat&logo=github)](https://github.com/interledgerjs/interledgerjs/actions?query=workflow%3Amaster)
[![Codecov](https://img.shields.io/codecov/c/github/interledgerjs/interledgerjs/master.svg?logo=codecov&flag=stream_receiver)](https://codecov.io/gh/interledgerjs/interledgerjs/tree/master/packages/stream-receiver/src)
[![Prettier](https://img.shields.io/badge/code_style-prettier-brightgreen.svg)](https://prettier.io/)

- [Overview](#overview)
  - [Which version?](#which-version)
- [Install](#install)
- [Guide](#guide)
  1. [Generate server secret](#1-generate-server-secret)
  2. [Integrate an Open Payments server](#2-integrate-an-open-payments-server)
  3. [Integrate the STREAM server](#3-integrate-the-stream-server)
     - [_Optional_: Perform cross-currency conversion](#optional-perform-cross-currency-conversion)
     - [Reply to the ILP Prepare](#reply-to-the-ilp-prepare)
     - [Credit balances](#credit-balances)
- [API](#api)
  - **[`ServerOptions`](#serveroptions)**
  - **[`StreamServer`](#streamserver)**
  - **[`ConnectionDetails`](#connectiondetails)**
  - **[`StreamCredentials`](#streamcredentials)**
  - **[`IncomingMoney`](#incomingmoney)**

## Overview

[STREAM](https://interledger.org/rfcs/0029-stream/) is a protocol between a sender and receiver on the Interledger network to coordinate a payment of many smaller Interledger packets. First, a client requests credentials from a server: a shared encryption key and a unique ILP address of the recipient, which may be exchanged using [Open Payments](https://openpayments.dev) or [SPSP](https://interledger.org/rfcs/0009-simple-payment-setup-protocol/). Using these credentials, a STREAM client initiates a connection to a STREAM server by sending it an ILP packet, containing special, encrypted STREAM messages. Then, either the client or server may send additional ILP packets containing STREAM messages to one another with money and/or data over Interledger.

`stream-receiver` is a STREAM server to "unlock" and accept incoming money. It's a simple function that takes an incoming ILP Prepare packet, validates and authenticates its STREAM data, and returns an ILP Fulfill or Reject with corresponding STREAM data to reply to the sender. The API consumer can choose to accept or decline incoming money before the packet is fulfilled, to simplify integration with their own balance tracking system.

### Which version?

[`ilp-protocol-stream`](https://github.com/interledgerjs/ilp-protocol-stream) is a general-purpose STREAM implementation that can operate as both a client or a server to simultaneously send & receive payments. By contrast, this module is recommended for integration with an Open Payments server, and is tailored to receive incoming payments.

## Install

```sh
npm i @interledger/stream-receiver
```

Or using Yarn:

```sh
yarn add @interledger/stream-receiver
```

## Guide

To receive STREAM payments on Interledger, these components are necessary:

- **STREAM server**: to receive and fulfill incoming ILP packets via an Interledger connector, and coordinate the payment with the STREAM sender via STREAM messages
- **Open Payments/SPSP server**: an HTTP server to setup payments and share connection credentials with the sending client
- **Persistent data store** to track invoice balances and/or the total amount received over each STREAM connection

This guide walks through how to wire these components together, and how they may be deployed by a wallet that services and accepts incoming Interledger payments on behalf of many users.

### 1. Generate server secret

First, the operator should randomly generate a 32 byte server secret seed, which is used in both the STREAM server and Open Payments/SPSP server. This secret is used to statelessly generate and derive connection credentials, so incoming ILP Prepare packets can be decrypted and fulfilled without persisting each set of credentials in a database. This also enables the STREAM server and Open Payments/SPSP server to operate in separate processes.

An operator is recommended to periodically rotate their server secret. Any credentials generated using an older shared secret would not be accepted if it changes, but since credentials are ephemeral and designed to be used immediately, the effect for clients should be minimal.

### 2. Integrate an Open Payments server

An [Open Payments](https://openpayments.dev/) server hosts an HTTP API to setup and authorize payments, including invoice-based push payments and mandate-based pull payments. To implement the APIs for such a server, refer to the [full specification](https://docs.openpayments.dev/api).

Here, we'll demonstrate how to generate connection credentials, referred to as _[payment details](https://docs.openpayments.dev/payments)_ in the Open Payments spec, and return them to the client.

First, create a **[`StreamServer`](#streamserver)** with the base ILP address of the STREAM server and previously generated server secret:

```js
import { StreamServer } from '@interledger/stream-receiver'

const server = new StreamServer({
  serverSecret: Buffer.from(PROCESS.env.SERVER_SECRET, 'hex'), // Example: '61a55774643daa45bec703385ea6911dbaaaa9b4850b77884f2b8257eef05836'
  serverAddress: PROCESS.env.SERVER_ADDRESS, // Example: 'g.mywallet.receiver'
})
```

Then, for the proper endpoints within the server (this snippet uses [Express](https://expressjs.com/)), generate and return a new set of connection credentials:

```js
express().get('/.well-known/open-payments', (req, res) => {
  const credentials = server.generateCredentials()
  return req.json({
    ilpAddress: credentials.ilpAddress,
    sharedSecret: credentials.sharedSecret.toString('base64'),
  })
})
```

The credentials include a unique ILP address to identify this connection, and a shared encryption key so the client can encrypt STREAM messages so other connectors cannot read or tamper with them. The encryption key also enables them to generate conditions for ILP Prepare packets that this STREAM server can fulfill. Note: these credentials are only valid when used with this STREAM server implementation, and not `ilp-procotol-stream`, or the Java or Rust implementations.

To support [STREAM receipts](https://interledger.org/rfcs/0039-stream-receipts/), a feature that enables sender to prove to a third-party verifier how much has been delivered, input the nonce and secret from the request when generating credentials:

```js
server.generateCredentials({
  receiptSetup: {
    nonce: Buffer.from(req.headers['Receipt-Nonce'], 'base64'),
    secret: Buffer.from(req.headers['Receipt-Secret'], 'base64'),
  },
})
```

If generating credentials for an [Open Payments invoice](https://docs.openpayments.dev/invoices), the operator could encode necessary metadata into the generated credentials using the `paymentTag` option, such as an invoice ID:

```js
server.generateCredentials({
  paymentTag: 'a6bbd8e4-864a-4e52-b037-7938e00e6537',
})
```

The `paymentTag` will be exposed on each incoming packet so the operator can correlate it with the correct user. The operator can choose any format or data to encode into the `paymentTag`, so long as it's limited to ASCII characters. These details will be securely encrypted into the ILP address, so neither the sender nor any other connectors can read them.

Lastly, only when generating credentials for an [SPSP](https://interledger.org/rfcs/0009-simple-payment-setup-protocol/) request (but unnecessary for Open Payments), the operator should provide the asset and denomination of the recipient, which will later be shared with the client over STREAM:

```js
server.generateCredentials({
  asset: {
    code: 'USD',
    scale: 6,
  },
})
```

### 3. Integrate the STREAM server

First, the operator must be connected to an Interledger network. They may operate one or multiple connector instances, such as the JavaScript [`ilp-connector`](https://github.com/interledgerjs/ilp-connector) or [Java connector](https://github.com/interledger4j/ilpv4-connector).

To handle incoming ILP Prepare packets, they could use a custom [`ilp-connector` middleware](https://github.com/interledgerjs/ilp-connector#extensibility-middlewares), or a [plugin](https://github.com/interledgerjs?q=plugin&type=&language=) that connects to their connector, like so:

```js
const plugin = new Plugin({ ... })
await plugin.connect()

plugin.registerDataHandler(async (data) => {
  // STREAM server logic will be included here
})
```

To integrate this STREAM server, the operator handles incoming ILP Prepare packets, and then uses this library to create the appropriate ILP reply packet with STREAM messages in response. This also allows them to intermix their own accounting logic to credit the incoming packet.

As with the Open Payments/SPSP server, first, instantiate another **[`StreamServer`](#streamserver)** using the same secret and ILP address, which is used to re-derive the previously generated credentials for each connection:

```js
import { StreamServer } from '@interledger/stream-receiver'

const server = new StreamServer({
  serverSecret: Buffer.from(process.env.SERVER_SECRET, 'hex'),
  serverAddress: process.env.SERVER_ADDRESS,
})
```

#### _Optional_: Perform cross-currency conversion

Some deployments may receive payments on behalf of many user accounts denominated in different currencies, in which the operator performs foreign exchange into the final currency of each user account. The particular destination currency of each packet may be unknown until the user account is known.

When the connection was generated, the operator should encode the metadata into the `paymentTag` field necessary to lookup the asset they should convert into, such as the user account or invoice that payment is attributed to.

To extract the `paymentTag` from when the connection credentials were generated, provide the destination ILP address of an incoming ILP Prepare into the `decodePaymentTag` method of the **[`StreamServer`](#streamserver)**:

```js
const prepare = deserializeIlpPrepare(data)
const tag = server.decodePaymentTag(prepare.destination)
```

If no payment tag was encoded, or the token in the ILP address could not be decrypted, `undefined` will be returned, otherwise the `paymentTag` will be returned as a `string`.

Accordingly, adjust the `amount` field of the ILP Prepare, converting into the destination currency, before the STREAM server handles the packet. If foreign exchange is performed, it must be applied to all packets for a connection, including unfulfillable STREAM packets, since they're used for the STREAM sender to probe the exchange rate.

#### Reply to the ILP Prepare

Next, hand the ILP Prepare off to the STREAM server, providing the adjusted ILP Prepare into the `createReply` method on the **[`StreamServer`](#streamserver)**:

```js
const moneyOrReply = server.createReply(prepare)
```

The STREAM server will ensure the packet is addressed correctly, decrypt the STREAM messages from the sender, validate they are authentic, ensure the packet meets its minimum exchange rate, and create appropriate STREAM messages in response. Then, the STREAM server will return an **[`IlpReject`](../ilp-packet/README.md#ilpreject)** packet, or an **[`IncomingMoney`](#incomingmoney)** instance, so the operator can optionally choose to accept or decline the incoming funds.

If the STREAM server directly returns a reply packet, no funds can be received (for example, there were no authentic STREAM messages, or the sender may have restricted the packet as unfulfillable). Reply to the ILP Prepare with that ILP Reject or ILP Fulfill (which is only returned if the amount of the Prepare was 0):

```js
import { isIlpReply, serializeIlpReply } from 'ilp-packet'

// ...

if (isIlpReply(moneyOrReply)) {
  return serializeIlpReply(moneyOrReply)
}
```

Alternatively, the ILP Prepare contains funds that may be fulfilled. The operator can add their own asynchronous logic to choose to accept or decline the packet, and use the **[`IncomingMoney`](#incomingmoney)** instance to create the corresponding ILP reply packet.

For instance, to accept the incoming money and create the corresponding ILP Fulfill packet, call the `accept` method:

```js
serializeIlpFulfill(moneyOrReply.accept())
```

If the recipient cannot accept the funds, it can choose to temporarily or permanently decline them. To temporarily decline, call `temporaryDecline`, which creates an ILP Reject that instructs the STREAM sender to send packets less frequently:

```js
serializeIlpReject(moneyOrReply.temporaryDecline())
```

Alternatively, call `finalDecline`, which creates an ILP Reject that instructs the sender to close the connection and stop sending packets altogether.

#### Credit balances

Before replying with an ILP Fulfill, the packet should be correctly accounted for.

If the packet pays into an Open Payments invoice per the encoded `paymentTag`, the operator should credit that invoice with the delivered amount into its stateful balance system. If the packet is fulfilled, the STREAM server will inform the sender that the `amount` field of the ILP Prepare was the amount delivered to the recipient, which they will use for their own accounting.

If the connection supports STREAM receipts, the operator should also track the total amount received over the connection in a stateful system per each `connectionId`. Then, before accepting or declining the money, they should set the total amount received, so the STREAM server can sign and include a receipt in its reply. For example:

```js
const totalReceived = await addIncomingFunds(connection.connectionId, prepare.amount)
moneyOrReply.setTotalReceived(totalReceived)

// ...

serializeIlpFulfill(moneyOrReply.accept())
```

Since connections are very short-lived, the operator may periodically purge stale connection balances. Note: these connection balances are distinct from, for example, Open Payments invoice balances, and must be accounted for separately.

## API

Here, ILP packets are provided and returned _deserialized_ using interfaces exported from [`ilp-packet`](../ilp-packet): **[`IlpPrepare`](../ilp-packet/README.md#ilpprepare)**, **[`IlpFulfill`](../ilp-packet/README.md#ilpfulfill)**, and **[`IlpReject`](../ilp-packet/README.md#ilpreject)**.

#### `ServerOptions`

> Interface

Parameters to statelessly generate new STREAM connection credentials and handle incoming packets for STREAM connections.

| Property            | Type     | Description                                                                       |
| :------------------ | :------- | :-------------------------------------------------------------------------------- |
| **`serverSecret`**  | `Buffer` | Secret seed used to statelessly derive keys for many STREAM connections.          |
| **`serverAddress`** | `string` | Base ILP address of this STREAM server to access it over the Interledger network. |

#### `StreamServer`

> `new (options: ServerOptions): StreamServer`

Generate and validate STREAM connection credentials so a client may send packets to the STREAM server. This enables an Open Payments or SPSP server to generate new connections separately from the STREAM server and ILP-connected infrastructure, so long as they are configured with the same server secret and ILP address.

| Property                  | Type                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| :------------------------ | :--------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`generateCredentials`** | `(options?: ConnectionDetails): StreamCredentials`   | Generate credentials to return to a STREAM client so they may establish a connection to this STREAM server. Throws if the receipt nonce or secret are invalid lengths, the asset scale was not 0-255, or that data cannot fit within an ILP address.                                                                                                                                                                                                                                                                                                                   |
| **`decodePaymentTag`**    | `(destinationAddress: string): string \| undefined`  | Extract the `paymentTag` from the given destination ILP address, or return `undefined` if the connection token is invalid or no payment tag was encoded.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **`createReply`**         | `(prepare: IlpPrepare) => IncomingMoney \| IlpReply` | Process the incoming ILP Prepare within the STREAM server: ensure it's addressed to the server, decrypt the sender's STREAM messages, validate their authenticity, ensure the packet meets its minimum exchange rate, and create appropriate STREAM messages in response. If the packet does nto carry money, an `IlpReject` or `IlpFulfill` (if the Prepare was for 0) is directly returned. If the packet is valid and fulfillable, an **[`IncomingMoney`](#incomingmoney)** instance is returned to accept or decline the funds and generate the appropriate reply. |

#### `ConnectionDetails`

> Interface

Application-layer metadata to encode within the credentials of a new STREAM connection.

| Property                  | Type                  | Description                                                                                                                                                                                                        |
| :------------------------ | :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`paymentTag`**          | (_Optional_) `string` | Arbitrary data to attribute or handle an incoming payment. For example, an identifier to correlate which user account or invoice the payment should be credited to.                                                |
| **`receiptSetup`**        | (_Optional_) `Object` | Parameters to generate authentic STREAM receipts so a third party may verify incoming payments.                                                                                                                    |
| **`receiptSetup.nonce`**  | `Buffer`              | 16-byte STREAM receipt nonce                                                                                                                                                                                       |
| **`receiptSetup.secret`** | `Buffer`              | 32-byte STREAM receipt secret                                                                                                                                                                                      |
| **`asset`**               | (_Optional_) `Object` | Destination asset details of the recipient's Interledger account, to share with the sender. **Note**: should only be provided if generating credentials for an SPSP request, but is unnecessary for Open Payments. |
| **`asset.code`**          | `string`              | Asset code or symbol identifying the currency of the recipient account.                                                                                                                                            |
| **`asset.scale`**         | `number`              | Precision of the asset denomination: number of decimal places of the ordinary unit, between 0 and 255 (inclusive).                                                                                                 |

#### `StreamCredentials`

> Interface

Credentials uniquely identifying a connection, to provide to a STREAM client to establish an authenticated connection with this receiver.

| Property           | Type     | Description                                                                                                              |
| :----------------- | :------- | :----------------------------------------------------------------------------------------------------------------------- |
| **`sharedSecret`** | `Buffer` | 32-byte seed to encrypt and decrypt STREAM messages, and generate ILP packet fulfillments.                               |
| **`ilpAddress`**   | `string` | ILP address of the recipient account, identifying this connection, for the client to send packets to this STREAM server. |

#### `IncomingMoney`

> Interface

Pending STREAM request and in-flight ILP Prepare with funds that may be fulfilled or rejected.

| Property               | Type                                                | Description                                                                                                                                                                                           |
| :--------------------- | :-------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`connectionId`**     | `string`                                            | Unique identifier of this STREAM connection: SHA-256 hash of destination ILP address with token, hex-encoded.                                                                                         |
| **`paymentTag`**       | `string \| undefined`                               | Arbitrary data to attribute or handle an incoming payment, encoded when the credentials were generated.                                                                                               |
| **`setTotalReceived`** | `(totalReceived: Long \| string \| number) => void` | Sign and include a STREAM receipt for the total amount received on this STREAM connection, per `connectionId`, including the additional amount from this packet. Amount must be within the u64 range. |
| **`accept`**           | `() => IlpFulfill`                                  | Create an ILP Fulfill to accept the money from this incoming ILP Prepare packet.                                                                                                                      |
| **`temporaryDecline`** | `() => IlpReject`                                   | Create an ILP Reject to temporarily decline the incoming money: inform the STREAM sender to backoff in time.                                                                                          |
| **`finalDecline`**     | `() => IlpReject`                                   | Create an ILP Reject to inform the STREAM sender to close their connection.                                                                                                                           |
