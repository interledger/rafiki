---
title: Peering
---

## What is a peer / a peering relationship?

A peer is a counterparty that a given party transacts with. Within the Interledger Protocol, connectors maintain peers, or counterparty connectors whom they transact with. The Interledger network is a graph of nodes (connectors) that have peered with one another by establishing a means of exchanging ILP packets and a means of paying one another for the successful forwarding and delivery of the packets. A connector may extend a given peer a limited line of credit, or none at all, depending upon their trustworthiness.

Rafiki includes an implementation of such a connector.

## What are the requirements for peering?

Both counterparties need to

- run an implementation of an Interledger connector, ideally Rafiki
- agree on an asset of the peering relationship
- agree on a `maxPacketAmount`, which specifies into how many packets a payment is split (or use default value within Rafiki)
- communicate their static ILP address
- communicate a connection endpoint for the peer to send packets to
- exchange auth tokens for the connection endpoint

Additionally, the two counterparties need to agree on a settlement mechanism. However, that is outside of the scope of Interledger / Rafiki.

Note that two counterparties could have multiple peering relationships that differ in e.g. the underlying asset.

## How to peer two Rafiki instances?

### Using the Admin Dashboard

Once the [`frontend`](https://github.com/interledger/rafiki/blob/main/packages/frontend) project is running (typically as part of the [local environment](https://github.com/interledger/rafiki/blob/main/localenv)), you can navgiate to the Peers page, and then press the Create Peer button. You will be prompted to enter the peer information such as the peer's static ILP address, as well as the corresponding HTTP info.

### Using the Admin API

This section describes the process for setting up peering between two Rafiki instances using the [Admin API](/integration/management). The examples are given for one instance, the other instance would have to run the corresponding API calls.

Assume the following peering relationship

- asset: USD with a scale of 2
- peer's static ILP address: g.othergreatwallet
- peer's name: "The Other Great Wallet"

Note that each GraphQL request has two parts: a _query_ and an object containing _query variables_.

### Create Asset

Query:

```
mutation CreateAsset ($input: CreateAssetInput!) {
  createAsset(input: $input) {
    code
    success
    message
    asset {
      id
      code
      scale
    }
  }
}
```

Query Variables:

```
{
  "input": {
    "code": "USD",
    "scale": 2
  }
}
```

Example Successful Response

```
{
  "data": {
    "createAsset": {
      "code": "200",
      "success": true,
      "message": "Created Asset",
      "asset": {
        "id": "b3dffeda-1e0e-47d4-82a3-69b1a622eeb9",
        "code": "USD",
        "scale": 2
      }
    }
  }
}
```

### Create Peer

Query:

```
mutation CreatePeer ($input: CreatePeerInput!) {
  createPeer (input: $input) {
    code
    success
    message
    peer {
      id
      asset {
        code
        scale
      }
      staticIlpAddress
      name
    }
  }
}
```

Query Variables (substitute the asset ID from the "create asset" response for `INSERT_ASSET_ID`):

```
{
  "input": {
    "staticIlpAddress": "g.othergreatwallet",
    "name": "The Other Great Wallet"
    "http": {
      "incoming": {"authTokens": ["mytoken"]},
      "outgoing": {"endpoint": "ilp.othergreatwallet.com", "authToken": "theirtoken"}
    },
    "assetId": "INSERT_ASSET_ID",
    "initialLiquidity: <optionally, and intial amount of liquity to provision. Liquidity can also be added via the `AddPeerLiquidity` mutation described below>
  }
}
```

Notes:

- The peer's connector endpoint has been mapped to `ilp.othergreatwallet.com`. Locally and by default, it is on `0.0.0.0:3002`.
- `mytoken` is the token my peer will need to present to connect and send packets to me
- `theirtoken` is the token I'll have to present to my peer to connect and send packets to them

Example Successful Response

```
{
  "data": {
    "createPeer": {
      "code": "200",
      "success": true,
      "message": "Created ILP Peer",
      "peer": {
        "id": "480ef339-7842-4501-a905-923fc1339cef",
        "asset": {
          "code": "USD",
          "scale": 2
        },
        "staticIlpAddress": "g.othergreatwallet",
        "name": "The Other Great Wallet"
      }
    }
  }
}
```

### Add Peer Liquidity

Query:

```
mutation AddPeerLiquidity ($input: AddPeerLiquidityInput!) {
  addPeerLiquidity(input: $input) {
    code
    success
    message
    error
  }
}
```

Query Variables (substitute the peer ID from the "create peer" response for `INSERT_PEER_ID`):

```
{
  "input": {
    "peerId": "INSERT_PEER_ID",
    "amount": "10000",
    "id": "a09b730d-8610-4fda-98fa-ec7acb19c775"
  }
}
```

Note that the peer has a liquidity of 100 USD. How this is secured, whether the peer has to pre-fund that amount somewhere or whether that is a line of credit, is out of scope.

Example successful response:

```
{
  "data": {
    "addPeerLiquidity": {
      "code": "200",
      "success": true,
      "message": "Added peer liquidity",
      "error": null
    }
  }
}
```

### Withdraw Peer Liquidity

This is a two-phase transaction, so the withdrawal needs to be created first and then posted (i.e. the Account Servicing Entity commits to the withdrawal). This way, the Account Servicing Entity can safely perform withdrawals in their internal system before posting in Rafiki. If the internal withdrawal failed or an error was made when creating the withdrawal in Rafiki, it can be voided rather than posted.

#### Create Withdrawal

Query:

```
mutation CreatePeerLiquidityWithdrawal ($input: CreatePeerLiquidityWithdrawalInput!) {
  createPeerLiquidityWithdrawal(input: $input) {
    code
    success
    message
    error
  }
}
```

Query Variables (substitute the ID from the "create peer" response for `INSERT_PEER_ID`):

```
{
  "input": {
    "peerId": "INSERT_PEER_ID",
    "amount": "5000",
    "id": "25e4ae5b-e844-49f6-89fa-34f33bc03278"
  }
}
```

Example successful response:

```
{
  "data": {
    "createPeerLiquidityWithdrawal": {
      "code": "200",
      "success": true,
      "message": "Created peer liquidity withdrawal",
      "error": null
    }
  }
}
```

#### Post Withdrawal

Query:

```
mutation PostLiquidityWithdrawal ($withdrawalId: String!) {
  postLiquidityWithdrawal($withdrawalId: String!) {
    code
    success
    message
    error
  }
}
```

Query Variables (substitute the withdrawal ID from the "create withdrawal" request for `INSERT_WITHDRAWAL_ID`):

```
{
  "withdrawalId": "INSERT_WITHDRAWAL_ID"
}
```

Example successful response:

```
{
  "data": {
    "postLiquidityWithdrawal": {
      "code": "200",
      "success": true,
      "message": "Posted Withdrawal",
      "error": null
    }
  }
}
```

#### Void Withdrawal

Query:

```
mutation VoidLiquidityWithdrawal ($withdrawalId: String!) {
  voidLiquidityWithdrawal($withdrawalId: String!) {
    code
    success
    message
    error
  }
}
```

Query Variables (substitute the withdrawal ID from the "create withdrawal" request for `INSERT_WITHDRAWAL_ID`):

```
{
  "withdrawalId": "INSERT_WITHDRAWAL_ID"
}
```

Example successful response:

```
{
  "data": {
    "voidLiquidityWithdrawal": {
      "code": "200",
      "success": true,
      "message": "Voided Withdrawal",
      "error": null
    }
  }
}
```

## Auto-peering

Additionally, certain peers will have _auto-peering_ available. This feature is only for sandbox environments, and should not be used in production environments. Auto-peering enables easier peering integration between Rafiki instances. In order to use this feature, it requires the peer you want to peer with to publish an "auto-peering" URL. Once this `peerUrl` is provided, instead of using `createPeer` mutation to create a peer, you can call `createOrUpdatePeerByUrl`:

```gql
mutation CreateOrUpdatePeerByUrl($input: CreateOrUpdatePeerByUrlInput!) {
  createOrUpdatePeerByUrl(input: $input) {
    code
    success
    message
    peer {
      id
      asset {
        code
        scale
      }
      staticIlpAddress
      name
    }
  }
}
```

with the input being:

```
{
  "input": {
    "peerUrl: "PEER_URL",
    "assetId": "INSERT_ASSET_ID",
    "initialLiquidity: <optionally, and initial amount of liquidity to provision>
  }
}
```

Calling this mutation will exchange ILP peering information (`staticIlpAddress` `ilpConnectorAddress`, auth tokens) automatically. The instance being peered with will issue a default amount of liquidity, and you can begin sending payments to wallet addresses at the other Rafiki instance.

### Prerequisites

Before making the `createOrUpdatePeerByUrl` request, a few `backend` environment variables about your Rafiki instance need to be configured:

1. `ILP_ADDRESS`: The static ILP address of your Rafiki instance. This should already be defined in order to support ILP payments.
2. `ILP_CONNECTOR_ADDRESS`: The full address of the ILP connector that will receive ILP packets. Locally and by default, it is on `0.0.0.0:3002`.
3. `INSTANCE_NAME`: The name of your Rafiki instance. This is how your peer will identify you.

### How to enable auto-peering

:::caution
Auto-peering should _not_ be enabled in production environments. Only enable this feature in sandbox environments.
:::

Other than setting up the environment variables from the prerequisite step above, you will need to set additional `backend` environment variables:

1. `ENABLE_AUTO_PEERING`: true
2. Optionally, update the `AUTO_PEERING_SERVER_PORT` that the auto-peering server will run on. By default, it is `3005`.
3. Now, your Rafiki instance is ready to accept auto-peering requests. Your `peerUrl` will be the URL you've mapped to correspond with `AUTO_PEERING_SERVER_PORT`, and you can being communicating this URL to potential peers.
