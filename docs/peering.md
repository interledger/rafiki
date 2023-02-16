# Peering

## What is a peer / a peering relationship?

The Interledger network is a graph of nodes (connectors) that have peered with one another by establishing a means of exchanging ILP packets and a means of paying one another for the successful forwarding and delivery of the packets.

Rafiki includes an implementation of such a connector.

In the Interledger protocol, connectors maintain peers, or counterparty connectors whom they transact with. A connector may extend a given peer a limited line of credit, or none at all, depending upon their trustworthiness.

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

_Coming Soon_

### Using the Admin API

This section describes the process for setting up peering between two Rafiki instances using the [Admin API](./admin-api.md). The examples are given for one instance, the other instance would have to run the corresponding API calls.

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
    "assetId": "INSERT_ASSET_ID"
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

This is a two-phase transaction, so the withdrawal needs to be created first and then posted (i.e. the Account Servicing Entity commits to the withdrawal). If the withdrawal is faulty, it can be voided rather than posted.

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
