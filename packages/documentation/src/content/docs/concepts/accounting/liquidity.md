---
title: Liquidity
---

Rafiki implements a clearing protocol - the [Interledger Protocol](/reference/glossary#interledger-protocol). As such, it does not hold liquidity but keeps track of liquidity moving through it.

## Types of Liquidity

### Asset Liquidity

Asset Liquidity defines the amount of value, denominated in a given asset, Rafiki has at its disposal to send or forward ILP packets in. It increases if packets denominated in a given asset are received and decreases if packets denominated in a given asset are sent. It is always positive and cannot fall below 0.

Account Servicing Entities should define and adjust the asset liquidity based on their liquidity risk profile.

#### Example

Rafiki has been configured with 2 assets, EUR and USD, both with an asset scale of 0. The EUR liquidity is 10, the USD liquidity if 50.

In a cross-currency transaction, Rafiki receives packets worth 10 EUR and sends packets worth 11 USD. The EUR liquidity is increased to 20, the USD liquidity is reduced to 39.

A transaction where Rafiki receives 50 EUR and would have to sent 55 USD would fail because Rafiki does not have enough USD liquidity.

### Peer Liquidity

Peer Liquidity defines the line of credit, denominated in the asset of the peering relationship, that Rafiki gives a certain peer. It should be defined in the peering agreement and depends on the trust between the transacting peers. If peer liquidity is not sufficient, payments will not be processed. Once the peer liquidity is used up, peers should settle and then reset their peer liquidity.

#### Example

A configured peer _Cloud Nine Wallet_ within Rafiki has a peer liquidity of 100 USD. Rafiki can send packets up to 100 USD to wallet addresses issued by _Cloud Nine Wallet_. Once that liquidity is used up, we should settle with _Cloud Nine Wallet_ and then reset their liquidity to 100 USD.

### Payment Liquidity

When Open Payments incoming or outgoing payments are created, a liquidity account is created within the accounting database. Liquidity needs to be deposited to an outgoing payment before the payment can be processed. The Account Servicing Entity is notified to deposit liquidity via the `outgoing_payment.created` event. Similarly, packets that are received for an incoming payment increase its liquidity. The Account Servicing Entity is notified to withdraw that liquidity via the `incoming_payment.completed` event.

## Depositing and Withdrawing Liquidity

> **Note:** The `idempotencyKey` must be provided whenever calling mutations dealing with liquidity.
> This key allows safely retrying requests, without performing the operation multiple times.
> This should be a unique key (typically, a V4 UUID). For more information on Rafiki's idempotency, [see more](/apis/idempotency).

### Asset Liquidity

Deposit and withdraw asset liquidity via the Admin API (or UI):

```graphql
mutation DepositAssetLiquidity($input: DepositAssetLiquidityInput!) {
  depositAssetLiquidity(input: $input) {
    code
    success
    message
    error
  }
}
```

where

```json
{
  "input": {
    "id": "b97fd85a-126e-42ef-b40d-1a50a70ffa6f",
    "assetId": "7b8b0f65-896d-4403-b7ba-2e24bf20eb35",
    "amount": "100",
    "idempotencyKey": "b97fd85a-126e-42ef-b40d-1a50a70ffa6f"
  }
}
```

and

```graphql
mutation CreateAssetLiquidityWithdrawal(
  $input: CreateAssetLiquidityWithdrawalInput!
) {
  createAssetLiquidityWithdrawal(input: $input) {
    code
    success
    message
    error
  }
}
```

where

```json
{
  "input": {
    "id": "b97fd85a-126e-42ef-b40d-1a50a70ffa6f",
    "assetId": "7b8b0f65-896d-4403-b7ba-2e24bf20eb35",
    "amount": "100",
    "idempotencyKey": "b97fd85a-126e-42ef-b40d-1a50a70ffa6f"
  }
}
```

### Peer Liquidity

Deposit and withdraw peer liquidity via the Admin API (or UI):

```graphql
mutation DepositPeerLiquidity($input: DepositPeerLiquidityInput!) {
  depositPeerLiquidity(input: $input) {
    code
    success
    message
    error
  }
}
```

where

```json
{
  "input": {
    "id": "a09b730d-8610-4fda-98fa-ec7acb19c775",
    "peerId": "73158598-2e0c-4973-895e-aebd115af260",
    "amount": "1000000",
    "idempotencyKey": "a09b730d-8610-4fda-98fa-ec7acb19c775"
  }
}
```

and

```graphql
mutation CreatePeerLiquidityWithdrawal(
  $input: CreatePeerLiquidityWithdrawalInput!
) {
  createPeerLiquidityWithdrawal(input: $input) {
    code
    success
    message
    error
  }
}
```

where

```json
{
  "input": {
    "id": "421fae87-9a59-4217-9ff8-faf55ffab9c6",
    "peerId": "73158598-2e0c-4973-895e-aebd115af260",
    "amount": "100"
  }
}
```

### Payment Liquidity

#### Outgoing payment

Deposit and withdraw outgoing payment liquidity via the Admin API only:

```graphql
mutation DepositOutgoingPaymentLiquidity(
  $input: DepositOutgoingPaymentLiquidityInput!
) {
  depositOutgoingPaymentLiquidity(input: $input) {
    code
    error
    message
    success
  }
}
```

where

```json
{
  "input": {
    "outgoingPaymentId": "b4f85d5c-652d-472d-873c-4ba2a5e39052",
    "idempotencyKey": "a09b730d-8610-4fda-98fa-ec7acb19c775"
  }
}
```

and

```graphql
mutation CreateOutgoingPaymentWithdrawal(
  $input: CreateOutgoingPaymentWithdrawalInput!
) {
  createOutgoingPaymentWithdrawal(input: $input) {
    code
    error
    message
    success
  }
}
```

where

```json
{
  "input": {
    "outgoingPaymentId": "b4f85d5c-652d-472d-873c-4ba2a5e39052",
    "idempotencyKey": "a09b730d-8610-4fda-98fa-ec7acb19c775"
  }
}
```

#### Incoming payment

Withdraw incoming payment liquidity via the Admin API only:

```graphql
mutation CreateIncomingPaymentWithdrawal(
  $input: CreateIncomingPaymentWithdrawalInput!
) {
  createIncomingPaymentWithdrawal(input: $input) {
    code
    error
    message
    success
  }
}
```

where

```json
{
  "input": {
    "incomingPaymentId": "b4f85d5c-652d-472d-873c-4ba2a5e39052",
    "idempotencyKey": "a09b730d-8610-4fda-98fa-ec7acb19c775"
  }
}
```
