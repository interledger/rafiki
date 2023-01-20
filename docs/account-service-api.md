# Rafiki Account Service API

# OUTDATED Needs to be updated

See [Update Account Services API Docs](https://github.com/interledger/rafiki/issues/550)

- [Rafiki Account Service API](#rafiki-account-service-api)
- [OUTDATED Needs to be updated](#outdated-needs-to-be-updated)
- [Parties](#parties)
  - [**Permissioning**](#permissioning)
- [Encoding](#encoding)
- [Pagination](#pagination)
- [Idempotence](#idempotence)
  - [Client behavior](#client-behavior)
  - [Server behavior](#server-behavior)
- [Errors](#errors)
- [Interledger accounts](#interledger-accounts)
    - [Permissioning](#permissioning-1)
      - [InterledgerAccount resource](#interledgeraccount-resource)
    - [Fetch all Interledger accounts](#fetch-all-interledger-accounts)
    - [Get Interledger account](#get-interledger-account)
      - [InterledgerBalance resource](#interledgerbalance-resource)
    - [Get Interledger balance](#get-interledger-balance)
    - [Create Interledger account](#create-interledger-account)
    - [Update Interledger account](#update-interledger-account)
    - [Delete Interledger account](#delete-interledger-account)
    - [Transfer between Interledger accounts](#transfer-between-interledger-accounts)
      - [Parameters](#parameters)
    - [Process ILP-over-HTTP requests](#process-ilp-over-http-requests)
  - [Interledger balances](#interledger-balances)
  - [Settlement models](#settlement-models)
  - [Nesting](#nesting)
  - [Balance threshold notifications](#balance-threshold-notifications)
    - [List webhooks](#list-webhooks)
    - [Configure webhook](#configure-webhook)
    - [Get webhook](#get-webhook)
    - [Update webhook](#update-webhook)
    - [Delete webhook](#delete-webhook)
- [Liquidity accounts](#liquidity-accounts)
    - [Create liquidity account](#create-liquidity-account)
    - [Fetch liquidity accounts](#fetch-liquidity-accounts)
    - [Lookup liquidity account](#lookup-liquidity-account)
    - [Interledger accounts](#interledger-accounts-1)
  - [~~Liability accounts~~](#liability-accounts)
  - [Deposits](#deposits)
      - [Deposit resource](#deposit-resource)
    - [Execute deposit](#execute-deposit)
      - [Parameters](#parameters-1)
    - [Lookup deposit](#lookup-deposit)
  - [Withdrawals](#withdrawals)
    - [Crash recovery](#crash-recovery)
      - [Withdrawal resource](#withdrawal-resource)
    - [Request withdrawal](#request-withdrawal)
  - [`POST /liquidity-accounts/{accountId}/withdrawals`](#post-liquidity-accountsaccountidwithdrawals)
      - [Parameters](#parameters-2)
    - [Finalize pending withdrawal](#finalize-pending-withdrawal)
    - [Void pending withdrawal](#void-pending-withdrawal)
    - [Lookup withdrawal](#lookup-withdrawal)

# Parties

## **Permissioning**

_First party_ — exposed or accessible only to the provider, the operator of the Rafiki instance

- May implement custom server-side functionality interacting with those APIs, to enable them for their users
- Executing push-payments: quoting, streaming updates...
- Transaction history

_Second party_ — bilateral APIs with a privileged/authentic counterparty

- e.g. ILP-over-HTTP, BTP ...
- What if the bilateral connection is provisioned via a third party API?

_Third party_ — exposed or accessible to any entity

- SPSP server
- Open Payments APIs
- Authorization endpoints for future delegated, direct access

_Standardized_ specification, likely in an RFC

# Encoding

Request and response payloads are serialized as JSON and use the `application/json` MIME type. Clients should set the `Content-Type` and `Accept` headers accordingly.

# Pagination

TODO

# Idempotence

_Adapted from [IL-RFC 38: Settlement Engines](https://github.com/interledger/rfcs/blob/master/0038-settlement-engines/0038-settlement-engines.md)._

Idempotent requests ensure servers apply a side effect only once, even if clients invoke the same request multiple times.

For example, if a request to send a payment fails due to a network connection error, [idempotence](https://en.wikipedia.org/wiki/Idempotence) prevents a client from accidentally triggering duplicate payments when it retries the request.

## Client behavior

Clients should include an idempotency key, or globally unique string, within an `Idempotency-Key: <key>` header on `POST` requests. To avoid collisions, they must derive this key from a cryptographically secure source of randomness.

Clients should retry idempotent request to ensure eventual consistency with the server.

If the client receives no response, a `409 Conflict`, or `5xx` HTTP response, clients should retry the request with the same parameters and idempotency key. After a `2xx` or other `4xx` HTTP status, they client may conclude retrying and presume the response is final.

To prevent overwhelming the server, clients should exponentially backoff after each failed retry attempt and add random "jitter" to vary the retry interval.

## Server behavior

`POST` endpoints cache and lock previously unseen idempotency keys, so simultaneous requests can't trigger duplicate side effects.

Before responding, the server caches the response and status code corresponding to the request's idempotency key. If the server encounters a subsequent request with the same idempotency key, it returns same response and status code.

The server caches idempotency keys and response state for at least 24 hours after the initial request.

# Errors

Per REST conventions, standard HTTP errors are returned:

- `400 Bad Request` if required parameters were not given or invalid.
- `404 Not Found` if there was no record of the resource at the given path.

`4xx` errors generally indicate the client made an error constructing the request, with the exception of `404 Not Found` in response to retries of a `DELETE` request.

# Interledger accounts

An Interledger account tracks a financial accounting relationship among two counterparties, affected by ILP packets.

TODO — explanation ...

### Permissioning

TODO — everything here is first-party (\*with the exception of ILP-over-HTTP). However, the API service may wrap things to expose nicer 3rd party APIs).

#### InterledgerAccount resource

| ﻿Name                       | Optional | JSON type | Type        | Description                                                                                                                                                                                                                |
| :-------------------------- | :------- | :-------- | :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                          | No       | String    | V4 UUID     | Unique ID for this account, randomly generated by Rafiki.                                                                                                                                                                  |
| enabled                     | No       | Boolean   |             | Enables outgoing ILP packets to debit this account and incoming ILP packets to credit this account. If false, returns an F02 Unreachable error in response to all ILP packets. Pending ILP requests will still be applied. |
| liquidityAccountId          | Yes      | String    | V4 UUID     | TODO                                                                                                                                                                                                                       |
| maxPacketAmount             | No       | String    | UInt64      |                                                                                                                                                                                                                            |
| http                        | No       | Object    |             |                                                                                                                                                                                                                            |
| http.incoming               | No       | Object    |             |                                                                                                                                                                                                                            |
| http.incoming.authTokens    | No       | Array     |             | TODO: specify auth method? JWTs? Bearer tokens?                                                                                                                                                                            |
| http.incoming.authTokens[i] | No       | String    |             |                                                                                                                                                                                                                            |
| http.outgoing               | No       | Object    |             |                                                                                                                                                                                                                            |
| http.outgoing.authToken     | No       | String    |             |                                                                                                                                                                                                                            |
| http.outgoing.endpoint      | No       | String    |             |                                                                                                                                                                                                                            |
| asset                       | No       | Object    |             |                                                                                                                                                                                                                            |
| asset.scale                 | No       | Number    | UInt8       | Precision of the asset denomination: number of decimal places of the ordinary unit.                                                                                                                                        |
| asset.code                  | No       | String    |             | Asset code or symbol identifying the currency of the account.                                                                                                                                                              |
| stream                      | No       | Object    |             | STREAM receiver preferences                                                                                                                                                                                                |
| stream.enabled              | No       | Boolean   |             | Enables ILP packets destined for this account's STREAM receiver to be fulfilled. If disabled, packets may not be destined to this local account, but may be forwarded through this account.                                |
| routing                     | No       | Object    |             |                                                                                                                                                                                                                            |
| routing.staticIlpAddress    | No       | String    | ILP address | Statically configured ILP address (overrides dynamic address).                                                                                                                                                             |

TODO: dynamicIlpAddress should override this?

Defaults the node's ILP address with a segment appended for this account's ID.|
|routing.inheritFromRemote|No|Boolean||Should this account's ILP address be resolved from the peer node? Defaults to false.

For all peer accounts that do no inherit their own address from this node, this should be set to true.|
|routing.dynamicIlpAddress|Yes|String|ILP address|Dynamically configured ILP address, if available. Only queried if inheritFromRemote is true. Cached from the most recent query.|

### Fetch all Interledger accounts

**Request**

`GET /ilp-accounts`

**Response**

TODO

### Get Interledger account

**Request**

`GET /ilp-accounts/{accountId}`

**Response**

TODO

#### InterledgerBalance resource

| ﻿Name       | Optional | JSON type | Type    | Description                                                                                                                   |
| :---------- | :------- | :-------- | :------ | :---------------------------------------------------------------------------------------------------------------------------- |
| id          | No       | String    | V4 UUID | ID of the InterledgerAccount.                                                                                                 |
| createdTime | No       | String    | UInt64  | UNIX nanosecond timestamp when the primary Interledger balance is created, assigned by TigerBeetle as a sequence number.      |
| asset       | No       | Object    |         |                                                                                                                               |
| asset.code  | No       | String    |         | TODO                                                                                                                          |
| asset.scale | No       | Number    |         | TODO                                                                                                                          |
| balance     | No       | String    | UInt64  | Interledger balance available for the counterparty to spend by submitting ILP Prepares, or to withdraw to an external system. |

### Get Interledger balance

**Request**

`GET /ilp-accounts/{accountId}/balance`

**Response**

Returns the `**InterledgerBalance**` resource corresponding to the given account.

### Create Interledger account

**Request**

`POST /ilp-accounts`

**Response**

TODO

### Update Interledger account

**Request**

`PUT /ilp-accounts/{accountId}`

TODO: immutable: asset, id, ...

**Response**

TODO

### Delete Interledger account

**Request**

`DELETE /ilp-accounts/{accountId}`

**Response**

TODO

### Transfer between Interledger accounts

TODO

Note: only transacts against liquidity accounts if destination amount is different from origin amount? Otherwise just a simple account → account transfer?

TODO: Then, does this also need an API to apply the Fulfill?

**Request**

`POST /ilp-accounts/{originAccountId}/transfer`

#### Parameters

| ﻿Name                | Optional | JSON type | Type    | Description                                                                                                                |
| :------------------- | :------- | :-------- | :------ | :------------------------------------------------------------------------------------------------------------------------- |
| originAmount         | No       | String    | UInt64  | TODO                                                                                                                       |
| destinationAccountId | No       | String    | V4 UUID |                                                                                                                            |
| destinationAmount    | Yes      | String    | UInt64  | If omitted, defaults to the origin amount (but requires both accounts to be the same asset & denomination, or else fails). |
| autoPost           | Yes      | Boolean   |         | Defaults to two-phase transfer? If true, transfer is irrevocable                                                             |

**Response**

TODO

`204 No Content`

### Process ILP-over-HTTP requests

TODO — explain how the accounting works here (but where should the behavior for _routed_ requests be explained?)

TODO — In the ILP-over-HTTP, we should have the accountId in the path so the operator can specify which account to send a packet from while still using their own auth token

**Permissions (third-party)**

The counterparty who holds the account may send ILP packets to this endpoint with the provisioned authorization token. Additionally, the operator [TODO]

Here, the account is specified in the request path so the counterparty or the operator may use the same endpoint, ...

**Request**

`POST /ilp-accounts/{accountId}/ilp`

TODO — reference ILP-over-HTTP spec

**Response**

TODO

## Interledger balances

An account's **Interledger balance** represents a liability for the operator to its counterparty:

1. Funds available for its counterparty to spend via ILP Prepare packets submitted over Interledger, and/or
2. Funds payable to them via external settlement.

ILP Prepare packets submitted by a counterparty draw from their Interledger balance, since forwarding those packets creates other obligations for the operator. ILP Prepare packets fulfilled via a counterparty credit their Interledger balance, since they represent new obligations the operator agrees to owe its counterparty.

If an operator extends its counterparty a line of credit, the counterparty may owe debt to the operator. Even if its Interledger balance in isolation offers the counterparty funds available to spend, if the counterparty's outstanding debt exceeds its Interledger balance, the counterparty maintains a liability, on net, to the operator. Thus, an Interledger account's **net liability** is its Interledger balance minus outstanding debts, which is positive if the operator owes its counterparty, or negative if the counterparty owes the operator. If both parties wanted to finalize their financial relationship, one party issues a final settlement commensurate with its net liability.

~~From the perspective of the counterparty, these roles are reversed: _it_ is the operator of its own node, and the operator is its counterparty. [counterparty does its own bookkeeping]~~

Counterparties may accrue an Interledger balance in three ways:

1. The operator, or another Interledger account, extends a line of credit to their Interledger account.
2. The counterparty performs a settlement to the provider, depositing into their Interledger account.
3. The counterparty, or its hosted account, fulfills ILP packets submitted by the operator.

   ## Settlement models

For two Interledger counterparties to transact, at least one must extend some trust to the other, dictating how and when the parties settle with one another.

[explain "trust" ... prepayment, or line of credit? or both?]

[TODO: change from operator → counterparty to counterparty → operator]

As a counterparty fulfills ILP Prepare packets, the operator accrues liabilities to their counterparty. If the ILP packet flows one direction exceed the other, eventually, the operator will hit the trust limit decided by its counterparty: either by spending down from a balance they prepaid or the counterparty extended them as a line of credit. To continue transacting, they must settle their liabilities.

Interledger nodes may develop their own system to integrate an external ledger, billing, or settlement system with Rafiki. When the operator sends a payment via this external system to fund their Interledger account at the counterparty, the operator credits those funds as a deposit within Rafiki.

~~Interledger providers may develop their own system to integrate their own ledger, billing, or settlement system with Rafiki. When counterparties send a payment via this external system to fund their Interledger account, the provider credits those funds as a deposit within Rafiki. Similarly, counterparties may want to withdraw funds they receive over Interledger on an external system as implemented by their provider. Since these Interledger account balances may need to be settled on an external system, they represent liabilities to the operator.~~

TODO: If two counterparties are transacting over Interledger (not custodial account), then withdrawals need to be reconciled as deposits at the other —

Most settlement arrangements can be categorized in two ways:

1. **Asymmetric trust.** One party extends no trust to the other, and post-pays all Interledger obligations. The other party extends some trust, either as a pre-payment to hold a balance on its provider, or via extending them a line of credit to accept post-payments.
   - For example, many end users who send or receive payments — TODO
   - For example, some users or counterparties custody funds at their provider ...
   - Examples: fully custodied with _no balance tracking_ by user/counterparty ~~user will never have a net liability — delinquent? — to its provider~~
     - e.g. Merchant with hosted account that receives many incoming payments, and periodically withdraws funds to another financial institution
     - Provider servicing another provider, possibly ... (?)
2. **Mutual trust.** Both parties extend some trust to the other, typically as limited lines of credit. Depending upon Interledger packet flows, either party may post-pay the other after sufficient obligations accrue. One or both could prepay the other, but this locks up capital without mitigating risk, this both parties already extend some trust.
   - Examples — tier 1 providers, ...

## Nesting

Novel use cases such as mandates and invoices involve granting limited access to an existing Interledger account balance to some third party.

TODO

## Balance threshold notifications

TODO

### List webhooks

**Request**

`GET /ilp-accounts/{accountId}/webhooks`

`GET /liquidity-accounts/{accountId}/webhooks`

**Response**

TODO

### Configure webhook

**Request**

`POST /ilp-accounts/{accountId}/webhooks`

`POST /liquidity-accounts/{accountId}/webhooks`

TODO: parameters: BalanceThreshold

**Response**

TODO

### Get webhook

**Request**

`GET /ilp-accounts/{accountId}/webhooks/{webhookId}`

`GET /liquidity-accounts/{accountId}/webhooks/{webhookId}`

**Response**

TODO

### Update webhook

**Request**

`PUT /ilp-accounts/{accountId}/webhooks/{webhookId}`

`PUT /liquidity-accounts/{accountId}/webhooks/{webhookId}`

**Response**

TODO

### Delete webhook

**Request**

`DELETE /ilp-accounts/{accountId}/webhooks/{webhookId}`

`DELETE /liquidity-accounts/{accountId}/webhooks/{webhookId}`

**Response**

TODO

# Liquidity accounts

Every outgoing ILP packet sent by the provider decreases their funds available to service other transactions, whereas every ILP packet received by the provider increases their funds available to service other transactions. If providers perform foreign exchange, an incoming ILP packet may be converted into a different currency before forwarded as an outgoing ILP packet.

**Liquidity accounts** limit the volume of these cross-currency ILP packets and track earnings from fees and foreign exchange. Operators hold at least one liquidity account for each currency denomination they service.

Outgoing ILP packets draw down from liquidity accounts and increase the balance of an Interledger account, which may be denominated in a different asset than the incoming ILP packet. Since these cross-currency ILP packets increase the provider's liabilities, providers hold liquidity accounts to cap their potential liability if many ILP packets flow from one asset to another.

If the volume of ILP packets flowing from one currency to another is similar to the flow of the reverse direction, the flows net and the liquidity accounts remain liquid. If the outflow for one currency exceeds its inflow, the operator will ultimately need to top-up their liquidity accounts, adjust their rates, or rebalance their assets on an external exchange.

TODO: liquidity account resource

### Create liquidity account

**Request**

`POST /liquidity-accounts`

TODO: parameters

**Response**

TODO

### Fetch liquidity accounts

**Request**

`GET /liquidity-accounts`

**Response**

TODO

### Lookup liquidity account

**Request**

`GET /liquidity-accounts/{accountId}`

**Response**

TODO

### Interledger accounts

For a counterparty (a user or peer) to send ILP packets or payments over Interledger via their provider, they must maintain a balance within their Interledger account.

Counterparties may increase their Interledger account balance by receiving outgoing ILP packets into their account, receiving a loan or line or credit from their provider, or settling with their provider via its own, external system; that is, depositing with the provider.

## ~~Liability accounts~~

~~Both Interledger accounts and liquidity accounts are **liability accounts**, since they may obligate the provider to settle funds on an external ledger or system, or transfer funds to or from the operator's own external account.~~

~~Counterparties, or the operator themselves, may hold Interledger accounts, but only the operator holds liquidity accounts. However, settlement for both types of accounts is managed by a privileged API only exposed to the operator.~~

**~~Settlement accounts** represent the inverse of liability accounts: assets the operator may hold on an external system, which in aggregate equals their outstanding Interledger liabilities.~~

~~Settlement accounts enable operators to track and ascertain they custody sufficient assets to meet their reserve requirements to settle all Interledger liabilities. These Interledger liabilities include all liability account balances: funds deposited by counterparties, loans extended to counterparties, and liquidity earmarked for Interledger transactions.~~

~~Rafiki tracks one settlement account for each currency denomination serviced by the provider.~~

## Deposits

Deposits credit funds to an Interledger or liquidity account, and increase assets the operator may need reserved in their settlement account. Deposits should decrease the balance of a corresponding, external account.

To safely integrate this functionality:

1. Provider applies a balance reduction in its ledger corresponding to funds the counterparty sent to them, initiating the deposit.
2. Provider executes the deposit within Rafiki, performing the request with the same idempotency key until it gets an acknowledgement Rafiki credited the balance.
3. Provider finalizes or voids the deposit within its own system, depending upon if Rafiki successfully applied the deposit.

#### Deposit resource

| ﻿Name       | Optional | JSON type | Type    | Description                                                                              |
| :---------- | :------- | :-------- | :------ | :--------------------------------------------------------------------------------------- |
| id          | No       | String    | V4 UUID | Unique ID for this deposit, randomly generated by Rafiki.                                |
| amount      | No       | String    | UInt64  | Amount credited to the corresponding account.                                            |
| createdTime | No       | String    | UInt64  | UNIX nanosecond timestamp of the transfer, assigned by TigerBeetle as a sequence number. |

### Execute deposit

Credit the provided amount to an Interledger account as funds available to send over Interledger, which is immediately applied to the balance.

**Request**

`POST /ilp-accounts/{accountId}/deposits`

`POST /liquidity-accounts/{accountId}/deposits`

#### Parameters

| ﻿Name  | Optional | JSON type | Type   | Description                                  |
| :----- | :------- | :-------- | :----- | :------------------------------------------- |
| amount | No       | String    | UInt64 | Amount to immediately credit to the account. |

**Response**

Returns a `201 Created` with the new `**Deposit**` resource.

### Lookup deposit

**Request**

`GET /ilp-accounts/{accountId}/deposits/{depositId}`

`GET /liquidity-accounts/{accountId}/deposits/{depositId}`

**Response**

Returns the corresponding `**Deposit**` resource.

## Withdrawals

Withdrawals decrease the balance of an Interledger or liquidity account and decrease the assets of the operator's settlement account. Withdrawals should increase the balance of a corresponding, external account.

To safely integrate withdrawals:

1. Provider initiates a withdrawal in its own system, on behalf of their user.
2. Provider requests a withdrawal from Rafiki, which reduces the balance and places a hold on the funds, or fails if there's insufficient funds.
   - If the account has insufficient funds, the provider cancels the withdrawal within their system.
3. Provider credits the balance in their external system or performs a (potentially irrevocable) settlement.
   - If this fails, the provider may void the withdrawal with Rafiki.
4. After the settlement is applied, the provider finalizes the withdrawal within Rafiki, posting the balance reduction.
5. Provider finalizes the withdrawal in its system.

### Crash recovery

If the provider's withdrawal system crashes between steps 1 and 3, it may not know whether it already initiated the withdrawal and reserved funds within Rafiki. At this stage, it may choose to either:

1. **Retry.** Safely retry initiating the withdrawal in Rafiki. Since this is an idempotent request, it will only debit funds if they have not already been reserved for that withdrawal.
2. **Void.** Safely void the withdrawal within Rafiki. Since this is also an idempotent request, this only lifts the hold on funds if the same withdrawal was already initiated.
   - If the provider encounters a technical issue preventing them from settling or crediting the balance within their own system, they may decide to void the withdrawal.
   - Voids are not performed automatically, and only the provider's system initiates voids. For example, if the provider's system credited the withdrawal within its own system, then crashed, Rafiki might void the withdrawal before the operator's system recovered. This dangerous behavior might overdraw users, or enable them to steal money from the operator.
   - Operators may implement their own functionality to void withdrawals after a period of time.

If the provider's withdrawal system crashes between steps 3 and 5, the system knows Rafiki reserved the withdrawal amount, but it may not have finalized the withdrawal. So, the provider may safely retry finalizing the withdrawal within Rafiki as an idempotent request after they perform the settlement.

#### Withdrawal resource

| ﻿Name         | Optional | JSON type | Type    | Description                                                                                                                                              |
| :------------ | :------- | :-------- | :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id            | No       | String    | V4 UUID | Unique ID for this withdrawal, randomly generated by Rafiki.                                                                                             |
| amount        | No       | String    | UInt64  | Amount debited from the corresponding account, or amount on hold if the withdrawal is not yet finalized.                                                 |
| createdTime   | No       | String    | UInt64  | UNIX nanosecond timestamp when the withdrawal is initiated and funds were reserved, assigned by TigerBeetle as a sequence number.                        |
| finalizedTime | Yes      | String    | UInt64  | UNIX nanosecond timestamp of the finalized transfer, assigned by TigerBeetle as a sequence number. Excluded until the provider finalizes the withdrawal. |

### Request withdrawal

Requesting a withdrawal reserves funds in the corresponding account, if they're available, and creates a new resource for the pending withdrawal.

A successful response indicates the provider may safely and irrevocably credit the withdrawal amount to an account in its external system.

- Implementing a safe state machine within Rafiki

  [Implementing Stripe-like Idempotency Keys in Postgres](https://brandur.org/idempotency-keys)

  1. Create and lock a resource for the request's idempotency key in the relational DB. If the record already exists with a recovery point, begin executing from the existing phase.
  2. Create a withdrawal in the relational DB within an initial state and random TigerBeetle transfer ID. Atomically update a recovery point for the idempotency key record.
  3. Send an idempotent transfer to TigerBeetle to reserve the funds.
  4. If the transfer succeeds, update the withdrawal in the relational store to a reserved state and atomically update the recovery point. Then, successfully resolve the request.
  5. If the transfer fails, delete the withdrawal in the relational store and atomically update the recovery point. Then, return an insufficient funds error.

**Request**

`POST /ilp-accounts/{accountId}/withdrawals`

## `POST /liquidity-accounts/{accountId}/withdrawals`

#### Parameters

| ﻿Name  | Optional | JSON type | Type   | Description                                                                                                |
| :----- | :------- | :-------- | :----- | :--------------------------------------------------------------------------------------------------------- |
| amount | No       | String    | UInt64 | Amount to debit from the corresponding account, if available, as a hold until the withdrawal is finalized. |

**Response**

If successful, returns `201 Created` with the new `**Withdrawal**` resource. If the account balance is insufficient to perform the withdrawal, returns a `400 Bad Request` error.

### Finalize pending withdrawal

Posts the transfer debiting funds the given account, so funds may no longer be voided, marking the withdrawal as complete.

The finalization step exists so clients of Rafiki may differentiate pending withdrawals—which may be reverted—from withdrawals fully credited within the provider's external settlement system.

**Request**

`POST /ilp-accounts/{accountId}/withdrawals/{withdrawalId}/finalize`

`POST /liquidity-accounts/{accountId}/withdrawals/{withdrawalId}/finalize`

**Response**

If successful, returns a `204 No Content` response.

### Void pending withdrawal

Deletes the withdrawal resource and releases the hold on the account's funds.

**Request**

`DELETE /ilp-accounts/{accountId}/withdrawals/{withdrawalId}`

`DELETE /liquidity-accounts/{accountId}/withdrawals/{withdrawalId}`

**Response**

If successful, returns a `204 No Content` response. If the pending withdrawal was already voided, may return a `404 Not Found` error.

### Lookup withdrawal

**Request**

`GET /ilp-accounts/{accountId}/withdrawals/{withdrawalId}`

`GET /liquidity-accounts/{accountId}/withdrawals/{withdrawalId}`

**Response**

Returns the corresponding `**Withdrawal**` resource.
