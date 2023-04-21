# Connector

The [`backend`](./architecture.md#backend) includes an [Interledger](./glossary.md#interledger-protocol) connector for sending and receiving [STREAM](./glossary.md#stream) packets.

The amounts of these packets are used to update account balances in [TigerBeetle](./glossary.md#tigerbeetle). (See [Accounts and Transfers](./accounts-and-transfers.md))

Amounts are adjusted based on the destination/outgoing account's asset and Rafiki's configured exchange [rates service](./integration.md#exchange-rates).

## Packet Origination

The connector receives incoming ILP packets via:

- HTTP
- direct calls from within the `backend`

### Incoming HTTP

The `backend` includes an HTTP server listening on the configured [`CONNECTOR_PORT`](./deployment.md#backend).

An incoming ILP packet over HTTP is only accepted if it is from a configured [peer](./peering.md) and accompanied by the peer's incoming HTTP `authToken`.

### Backend

The `backend` includes services for managing [Open Payments](./glossary.md#open-payments) [quotes](https://docs.openpayments.guide/reference/create-quote) and [outgoing payments](https://docs.openpayments.guide/reference/create-outgoing-payment). Each of these calls the connector in order to send ILP packets. Quoting sends unfulfillable rate probe packets. Outgoing payments send packets as a part of executing the payment.

These calls to the connector are actually made by calling `makeIlpPlugin` and passing the plugin to the [`@interledger/pay`](https://github.com/interledgerjs/interledgerjs/tree/master/packages/pay) library.

## Packet Destination

An ILP packet may either terminate at the local Rafiki's STREAM server or continue on to a peer via HTTP.

### Local STREAM Server

The connector attempts to extract and decode the payment tag from a received ILP packet's destination address. If it is successfully able to match the tag with a locally managed [Open Payments](./glossary.md#open-payments) [payment pointer](./glossary.md#payment-pointer) or [incoming payment](https://docs.openpayments.guide/reference/create-incoming-payment), it will not forward the packet. The connector will credit the corresponding balance as well as track the total amount received for the STREAM connection in [Redis](./architecture.md) in order to support [STREAM receipts](https://interledger.org/rfcs/0039-stream-receipts/).

Packets addressed to a payment pointer happen via [SPSP](./glossary.md#payment-pointer), often for [Web Monetization](./glossary.md#web-monetization)

### Outgoing HTTP

If the ILP packet's destination address corresponds to a configured [peer](./peering.md), the connector will forward the packet to the peer over HTTP along with the peer's configured HTTP `authToken`.

## Packet Rejection

The connector may reject a packet with a corresponding [ILP error code](https://interledger.org/rfcs/0027-interledger-protocol-4/#error-codes) due to a number of reasons including:

- invalid packet
- insufficient liquidity
- rate limit exceeded
- amount exceeding `maxPacketAmount`
- expired packet
- and more!
