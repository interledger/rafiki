## Peering between development instances

This document assumes that you are running both the primary and secondary instances
of rafiki using the docker compose files in this directory. It describes the process for
setting up peering between them. If at any time your Rafiki instances become misconfigured,
the only way to get back to a working state covered in this document is to destroy the
docker compose stacks and their associated database volumes (e.g. with `pnpm localenv down`
followed by `pnpm localenv:dbvolumes:remove`).

### Load the graphql playgrounds in a browser

The graphql playground is the UI for sending graphql requests to the `backend` services.
The [graphql playground for the primary Rafiki instance](http://localhost:3001/graphql)
is on port 3001 on localhost. The [graphql playground for the secondary instance](http://localhost:4001/graphql)
is on port 4001.

### Create Peers

This section describes the process for setting up peering between the instances.
The commands to run on each instance are subtly different; make sure you are running
the correct command against the correct instance. If you make a mistake, the
best thing is to delete the docker compose stacks and database volumes and start over.

Each graphql request has two parts: a _query_ and an object containing _query variables_.
To make a request, put the query in the top input box on the graphql playground.
Open the query variables input by clicking the words "QUERY VARIABLES" at the bottom of the screen.
If the lower input bow is already open, make sure that "QUERY VARIABLES" is highlighted.
Add the query variables for the request to the query variables box, then press the
"play" button in the center of the screen. The right side of the screen will display
the response, which should always contain `"success": true` if things are working.

#### On the Primary Instance

On the [primary instance](http://localhost:3001), execute the following query to create
a peer record for the secondary instance:

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
    }
  }
}
```

Query Variables:

```
{
  "input": {
    "staticIlpAddress": "test.peer",
    "http": {
      "incoming": {"authTokens": ["test"]},
      "outgoing": {"endpoint": "peer-backend:3002", "authToken": "test"}
    },
    "asset": {
      "code": "710",
      "scale": 2
    }
  }
}
```

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
          "code": "710",
          "scale": 2
        },
        "staticIlpAddress": "test.peer"
      }
    }
  }
}
```

Next, run the following query to add liquidity for the secondary instance

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

#### On the Peer Instance

Next, run the reciprocal commands on the [secondary instance](http://localhost:4001). These commands are similar but
are directed _from_ the secondary instance _to_ the primary instance, so if you simply
copy the commands above it will not work.

Execute the following query to create a peer record for the primary instance:

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
    }
  }
}
```

Query Variables:

```
{
  "input": {
    "staticIlpAddress": "test.rafiki",
    "http": {
      "incoming": {"authTokens": ["test"]},
      "outgoing": {"endpoint": "backend:3002", "authToken": "test"}
    },
    "asset": {
      "code": "710",
      "scale": 2
    }
  }
}
```

Example successful response:

```

  "data": {
    "createPeer": {
      "code": "200",
      "success": true,
      "message": "Created ILP Peer",
      "peer": {
        "id": "b282a8f7-1874-4d53-8135-32c23058268f",
        "asset": {
          "code": "710",
          "scale": 2
        },
        "staticIlpAddress": "test.rafiki"
      }
    }
  }
}
```

Next, run the following query to add liquidity for the primary instance

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

Query Variables (substitute the ID from the "create peer" response for `INSERT_PEER_ID`):

```
{
  "input": {
    "peerId": "INSERT_PEER_ID",
    "amount": "10000",
    "id": "b09b734d-8610-4fda-98fa-ec7acb19c775"
  }
}
```

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

### Create Payment Pointers to Send and Receive Payments

In this step we will provision payment pointers on the primary and secondary Rafiki instances.
Payment pointers are not accounts. Rafiki operators must supply their own "account provider"
service for actually "holding" currency. Rafiki provides payment pointers--addresses within the
ILP network to which other nodes on the network can send payments, which will then be routed
to the account provider system and into the appropriate account. A payment pointer is a string that

At the end of this step, we will have two payment pointer IDs: one provisioned on the primary
instance and one provisioned on the secondary instance. We will use these payment pointer IDs in
subsequent steps to send payments between the Rafiki instances.

#### On the Primary Instance

On the [primary instance](http://localhost:3001) execute the following command to create a payment
pointer ID:

Query

```
mutation CreateAccount ($input: CreateAccountInput!) {
  createAccount(input: $input) {
    code
    success
    message
    account {
      id
      asset {
        id
        code
        scale
        withdrawalThreshold
      }
    }
  }
}
```

Query variables

```
{
  "input": {
    "asset": {
      "code": "710",
      "scale": 2
    },
    "publicName": "test-primary"
  }
}
```

Example successful response

```
{
  "data": {
    "createAccount": {
      "code": "200",
      "success": true,
      "message": "Created Account",
      "account": {
        "id": "afb2b1de-d819-4e85-b901-859c27445936",
        "asset": {
          "id": "5a27f8ec-17a5-4388-8d1e-8243d1926778",
          "code": "710",
          "scale": 2,
          "withdrawalThreshold": null
        }
      }
    }
  }
}
```

#### On the Secondary Instance

On the [secondary instance](http://localhost:4001) execute the following command to create a payment
pointer ID:

Query

```
mutation CreateAccount ($input: CreateAccountInput!) {
  createAccount(input: $input) {
    code
    success
    message
    account {
      id
      asset {
        id
        code
        scale
        withdrawalThreshold
      }
    }
  }
}
```

Query variables

```
{
  "input": {
    "asset": {
      "code": "710",
      "scale": 2
    },
    "publicName": "test-secondary"
  }
}
```

Example successful response

```
{
  "data": {
    "createAccount": {
      "code": "200",
      "success": true,
      "message": "Created Account",
      "account": {
        "id": "7e8b99f5-0861-49bd-95ab-e871c021d84d",
        "asset": {
          "id": "209fe717-bf02-4deb-826f-b7ed4f179713",
          "code": "710",
          "scale": 2,
          "withdrawalThreshold": null
        }
      }
    }
  }
}
```

#### Note the Payment Pointer IDs

The `data.createAccount.account.id` field in the response is the payment pointer ID, which we will
use in the next steps. In this example, the primary payment pointer ID is `afb2b1de-d819-4e85-b901-859c27445936`,
and the secondary payment pointer ID is `7e8b99f5-0861-49bd-95ab-e871c021d84d`.
