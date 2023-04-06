# Rafiki Architecture

![Architecture diagram](./img/rafiki-architecture.png)

Rafiki is a collection of three services that are run together; each one can be scaled horizontally. These services are

- [`backend`](../packages/backend): The main service, handling business logic and external communication.
- [`auth`](../packages/auth): The service used for Grant Authorization and authentication. Rafiki provides this as a reference implementation, with the understanding that Rafiki operators can use and deploy their own service for authorization and authentication.
- [`frontend`](../packages/frontend): This is an internal admin interface for Rafiki operators to manage their Rafiki instance.

These services rely on four databases:

- A postgres database used by the `backend`
- A separate postgres database used by `auth`.
- [TigerBeetle](https://github.com/coilhq/tigerbeetle) used by `backend` for accounting balances at the ILP layer.
- Redis used by `backend` as a cache to share STREAM connection details across processes.

## Backend

The `backend` service has four responsibilities:

- Expose REST [Open Payments API](https://docs.openpayments.guide/reference) endpoints for public clients to perform account management tasks.
- Expose an internal GraphQL Admin API for service operators to manage accounts and application settings like peering relationships.
- Expose an [ILP connector](./connector.md) to send and receive STREAM packets with peers.
- Business logic to manage accounts and track balances.

The `backend`'s ILP functionality includes:

- Accepting ILP packets over an HTTP interface and authenticating them against ILP account credentials
- Routing ILP packets to the correct destination account
- Converting currencies
- Sending out ILP packets over HTTP for destinations that are not local
- Fulfilling packets with an internal STREAM server

## Auth

The `auth` service performs authorization and authentication of incoming requests. For requests from entities that have accounts within the local instance of Rafiki, the `auth` service uses data stored in the auth postgres database. For requests from clients registered with other instances of Rafiki, the auth service resolves the client's public key from its source and uses it to authenticate and authorize the request.

## Frontend

The `frontend` project is a web app through which Rafiki administrators can manage their Rafiki instance though a UI. `frontend` communicates with the `backend` Admin API to manage [payment pointers](./glossary.md#payment-pointer), [peering relationships](./glossary.md#peer), and [assets](./glossary.md#asset), among other settings.

## Additional packages

### Token Introspection

The `token-introspection` package is a client library for making [GNAP](./glossary.md#grant-negotiation-authorization-protocol) token introspection requests to the auth server.
