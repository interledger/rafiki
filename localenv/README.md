# Local Playground

We have created a suite of packages that, together, mock an account servicing entity that has deployed Rafiki, exposing an [SPSP](https://rafiki.dev/resources/glossary#simple-payment-setup-protocol-spsp) endpoint, the [Open Payments](https://rafiki.dev/overview/concepts/open-payments) APIs with its required [GNAP](https://rafiki.dev/resources/glossary#grant-negotiation-and-authorization-protocol-gnap) auth endpoints to request grants, a STREAM endpoint for receiving Interledger packets, and a UI to view and manage the Rafiki instance.

These packages include:

- `backend` (SPSP, Open Payments APIs, GraphQL Admin APIs, STREAM endpoint)
- `auth` (GNAP auth server)
- `mock-account-servicing-entity` (mocks an [account servicing entity](https://rafiki.dev/overview/overview)
- `frontend` (Remix app to expose a UI for Rafiki Admin management via interaction with the `backend` Admin APIs)
- `kratos` (An identity and user management solution for the `frontend`)
- `mailslurper` (A SMTP mail server to catch account recovery emails for the `frontend`)

These packages depend on the following databases:

- TigerBeetle or Postgres (accounting)
- Postgres (Open Payments resources, auth resources)
- Redis (STREAM details, auth sessions)

We provide containerized versions of our packages together with two pre-configured docker-compose files ([Cloud Nine Wallet](./cloud-nine-wallet/docker-compose.yml) and [Happy Life Bank](./happy-life-bank/docker-compose.yml)) to start two Mock Account Servicing Entities with their respective Rafiki backend and auth servers. They automatically peer and 2 to 3 user accounts are created on both of them.

This environment will set up a playground where you can use the Rafiki Admin APIs and the Open Payments APIs.

## Disclaimer

> **The Mock ASE provided in this repository is intended solely for internal use and demonstration purposes. It is not designed to serve as a reference architecture. If you are looking for a reference implementation of an ASE, please refer to the [Test Wallet](https://github.com/interledger/testnet).**

## Environment overview

![Docker compose environment](../packages/documentation/public/img/localenv.png)

#### Cloud Nine Wallet

(a) User Interface - accessible at http://localhost:3030

(b) Admin API - accessible at http://localhost:3001/graphql

(c) Open Payments API - accessible at http://localhost:3000

(d) Auth Admin API - accessible at http://localhost:3003/graphql

(e) Open Payments Auth API - accessible at http://localhost:3006

(f) Admin UI - accessible at http://localhost:3010

(g) Kratos API - accessible at http://localhost:4433

#### Happy Life Bank

(h) User Interface - accessible at http://localhost:3031

(i) Admin API - accessible at http://localhost:4001/graphql

(j) Open Payments API - accessible at http://localhost:4000

(k) Auth Admin API - accessible at http://localhost:4003/graphql

(l) Open Payments Auth API - accessible at http://localhost:4006

(m) Admin UI - accessible at http://localhost:4010

(n) Kratos API - accessible at http://localhost:4432

#### Mail Slurper

(o) Mail UI - accessible at http://localhost:4436

#### Database

Postgres Server - accessible at http://localhost:5432

### Exploring Accounts on Mock Account Servicing Entity

Navigate to [`localhost:3030`](http://localhost:3030) to view the accounts on one instance of the Mock Account Servicing Entity called Cloud Nine Wallet.

![Mock Account Servicing Entity Accounts](../packages/documentation/public/img/map-accounts.png)

The accounts of the second instance (Happy Life Bank) can be found on [`localhost:3031`](http://localhost:3031).

When clicking on the Account Name, you can view the account information, the available balance, and see a list of transactions.

![Mock Account Servicing Entity Transactions](../packages/documentation/public/img/map-transactions.png)

## Running the local environment

### Dependencies

- [Rafiki local environment setup](../README.md#environment-setup)
- [docker](https://docs.docker.com/get-docker/)
- [Bruno](https://www.usebruno.com/downloads), an open source API client

### Setup

The following should be run from the root of the project.

```sh
# If you have spun up the environment before, remember to first tear down and remove volumes!

# start the local environment
pnpm localenv:compose up

# tear down and remove volumes
pnpm localenv:compose down --volumes

# tear down, delete database volumes and remove images
pnpm localenv:compose down --volumes --rmi all
```

If you want to use Postgres as the accounting database instead of TigerBeetle, you can use the `psql` variant of the `localenv:compose` commands:

```sh
pnpm localenv:compose:psql up
pnpm localenv:compose:psql down --volumes
```

The local environment consists of a primary Rafiki instance and a secondary Rafiki instance, each with
its own docker compose files ([Cloud Nine Wallet](./cloud-nine-wallet/docker-compose.yml), [Happy Life Bank](./happy-life-bank/docker-compose.yml)).
The primary Cloud Nine Wallet docker compose file (`./cloud-nine-wallet/docker-compose.yml`) includes the main Rafiki services `backend` and `auth`, as well
as the required data stores tigerbeetle (if enabled), redis, and postgres, so it can be run on its own.
The secondary Happy Life Bank docker compose file (`./happy-life-bank/docker-compose.yml`) includes only the Rafiki services, not the data stores. It uses the
data stores created by the primary Rafiki instance so it can't be run by itself.
The `pnpm localenv:compose up` command starts both the primary instance and the secondary.

See the `frontend` [README](../packages/frontend/README.md#ory-kratos) for more information regarding the Ory Kratos identity and user management system for the Admin UI.

#### Autopeering

If you want to start one local instance of Rafiki and peer it automatically to [Rafiki.money](https://rafiki.money), you can run the following commands:

```sh
# using Tigerbeetle DB
pnpm localenv:compose:autopeer

# OR using Postgres DB
pnpm localenv:compose:psql:autopeer
```

Your local Rafiki instance will be automatically peered with the remote [Rafiki.money](https://rafiki.money) instance.
The required services will be exposed externally using the [localtunnel](https://www.npmjs.com/package/localtunnel) package.
The exposed ports are 3000(open-payments), 3006(auth server), 3002(ILP connector).

To use the Open Payments example in the Bruno collection examples, follow these steps:

1. navigate to http://localhost:3030 to find the list of created wallet addresses (alternatively, run `docker logs rafiki-cloud-nine-mock-ase-1`)
2. copy the url of one of the wallet addresses
3. set the url as `senderWalletAddress` variable in the Bruno `Autopeering` environment

Note that you have to go through an additional "login" step by providing you IPv4 address as tunnel password before being able to visit the consent screen for the outgoing payment grant request. You can find out your current IPv4 address by e.g. visiting https://loca.lt/mytunnelpassword (or https://www.whatismyip.com/).

To shut down the connection and to clear the environment, run

```sh
pnpm localenv:compose down
```

This is necessary since on a new run of the scripts (with autopeering or not), the wallet address urls will differ.

### Debugging

Debuggers for the services are exposed on the following ports:

| IP and Port    | Services                  |
| -------------- | ------------------------- |
| 127.0.0.1:9229 | Cloud Nine Wallet Backend |
| 127.0.0.1:9230 | Cloud Nine Auth           |
| 127.0.0.1:9231 | Happy Life Bank Backend   |
| 127.0.0.1:9232 | Happy Life Bank Auth      |

#### With a chromium browser:

- go to `chrome://inspect`
- Click "Configure" and add the IP addresses and ports detailed above
- start docker containers
- click "inspect" on the service you want to debug to open the chromium debugger

You can either trigger the debugger by adding `debugger` statements in code and restarting, or by adding breakpoints directly in the chromium debugger after starting the docker containers.

#### With VS Code:

For debugging with VS Code, you can add this configuration to your `.vscode/launch.json`):

```json
{
    "name": "Attach to docker (cloud-nine-backend)",
    "type": "node",
    "request": "attach",
    "port": 9229,
    "address": "localhost",
    "localRoot": "${workspaceFolder}",
    "remoteRoot": "/home/rafiki/",
    "restart": true
},
```

`localRoot` will vary depending on the location of `launch.json` relative to rafiki's root directory.

For more ways to connect debuggers, see the Node docs for debugging: https://nodejs.org/en/learn/getting-started/debugging

### Shutting down

```sh
# tear down
pnpm localenv:compose down

# tear down and delete database volumes
pnpm localenv:compose down --volumes

# tear down, delete database volumes and remove images
pnpm localenv:compose down --volumes --rmi all
```

### Commands

| Command                                          | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ |
| `pnpm localenv:compose config`                   | Show all merged config (with Tigerbeetle)        |
| `pnpm localenv:compose up`                       | Start (with Tigerbeetle)                         |
| `pnpm localenv:compose up -d`                    | Start (with Tigerbeetle) detached                |
| `pnpm localenv:compose down`                     | Down (with Tigerbeetle)                          |
| `pnpm localenv:compose down --volumes`           | Down and kill volumes (with TigerBeetle)         |
| `pnpm localenv:compose down --volumes --rmi all` | Down, kill volumes (with Tigerbeetle) and images |
| `pnpm localenv:compose:psql config`              | Show all merged config (with Postgresql)         |
| `pnpm localenv:compose build`                    | Build all the containers (with Tigerbeetle)      |
| `pnpm localenv:compose:psql up`                  | Start (with Postgresql)                          |
| `pnpm localenv:compose:psql up -d`               | Start (with Postgresql) detached                 |
| `pnpm localenv:compose:psql down`                | Down (with Postgresql)                           |
| `pnpm localenv:compose:psql down --volumes`      | Down (with Postgresql) and kill volumes          |
| `pnpm localenv:compose:psql build`               | Build all the containers (with Postgresql)       |

### Usage

#### Bruno & Open Payments APIs

The Open Payments APIs can be interacted with using the [Bruno collection](https://github.com/interledger/rafiki/tree/main/bruno/collections/Rafiki) ([resource server endpoints](https://github.com/interledger/rafiki/tree/main/bruno/collections/Rafiki/Open%20Payments%20APIs) and [auth server endpoints](https://github.com/interledger/rafiki/tree/main/bruno/collections/Rafiki/Open%20Payments%20Auth%20APIs)). It requires you to

1. load the collection into Bruno by clicking "Open Collection"
2. navigating to `/rafiki/bruno/collections/Rafiki` on your machine and clicking "Open"
3. Furthermore, you need to either load the [Local Environment](https://github.com/interledger/rafiki/tree/main/bruno/collections/Rafiki/environments/Local%20Playground.bru) or the [Remote Environment](https://github.com/interledger/rafiki/tree/main/bruno/collections/Rafiki/environments/Remote.bru).

The Examples folder in the Bruno collection includes an [Open Payments](https://github.com/interledger/rafiki/tree/main/bruno/collections/Rafiki/Examples/Open%20Payments) example that can be executed one by one. It

1. requests the sender's wallet address
2. requests the receiver's wallet address
3. requests a grant to create an incoming payment on the receiver's account
4. creates an incoming payment on receiver's account
5. requests a grant to create (and read) a quote on the sender's account
6. creates a quote on the sender's account
7. requests a grant to create (and read) an outgoing payment on the sender's account

Note that you have to go through an interaction flow by clicking on the `redirect` link in the grant request response.

8. continues the grant request
9. creates an outgoing payment on the sender's account
10. fetches the outgoing payment on the sender's account

#### Admin UI

In order to manage and view information about the Rafiki instance(s) you can use the [Rafiki Admin](https://rafiki.dev/admin/admin-user-guide) UI. We have secured access to Rafiki Admin using [Ory Kratos](https://www.ory.sh/docs/kratos/ory-kratos-intro); however, in our local playground setup we've chosen to disable authorization for easier development and testing interactions.

If you'd like to enable authorization locally you can run `pnpm localenv:compose:adminauth up` and check out the setup in the [`admin-auth`](./admin-auth/) subdirectory. Note that, if authorization is enabled, you must register separately for Cloud Nine Wallet's Rafiki Admin and Happy Life Bank's Rafiki Admin, as they are intended to operate as distinct mock account servicing entities. Once you've registered, you can always come back to your Rafiki Admin account by navigating to [`localhost:3010`](http://localhost:3010) (Cloud Nine Wallet) or [`localhost:4010`](http://localhost:4010) (Happy Life Bank) and logging in. Since access to the UI is on an invitation-only basis the registration flow is not publicly available. As such, in order to access Rafiki Admin you can manually add a new user with the invite-user script. Run `docker exec -it <admin-container-name> npm run invite-user -- example@mail.com`, and it will output a link to the terminal. Copy and paste this link in your browser and you will automatically be logged in and directed to the account settings page. The next step is changing your password. We are using a simple email and password authentication method.

#### Admin APIs

In addition to the using the Admin UI for interacting with the Admin APIs, you can also use the Apollo explorer (on [`localhost:3001/graphql`](http://localhost:3001/graphql) and [`localhost:4001/graphql`](http://localhost:4001/graphql), respectively), and also via the [Bruno collection](https://github.com/interledger/rafiki/tree/main/bruno/collections/Rafiki/Rafiki%20Admin%20APIs). The Bruno collection is configured to use the default endpoints of the local environment.

#### SPSP

Every wallet address also serves as an SPSP endpoint. A GET request to e.g. `http://localhost:3000/accounts/gfranklin` with `Accept` header `application/spsp4+json` will return an SPSP response with STREAM connection details.

```http
http GET http://localhost:3000/accounts/gfranklin Host:backend Accept:application/spsp4+json

HTTP/1.1 200 OK
Connection: keep-alive
Content-Length: 220
Content-Type: application/spsp4+json
Date: Thu, 23 Feb 2023 13:07:24 GMT
Keep-Alive: timeout=5

{
    "destination_account": "test.rafiki.viXmy1OVHgvmQakNjX1C6kQMri92DzHeISEv-5VzTDuFhrpsrkDzsq5OO9Lfa9yed0L2RJGC9hA_IX-zztTtTZ87shCYvsQ",
    "receipts_enabled": false,
    "shared_secret": "Rz_vudcg13EPs8ehL2drvZFJS1LJ4Y3EltOI60-lQ78"
}

```

### Known Issues

#### TigerBeetle container exits with code 137

This is a known [issue](https://docs.tigerbeetle.com/getting-started/with-docker-compose/#exited-with-code-137) when running TigerBeetle in Docker: the container exits without logs and simply shows error code 137. To fix this, increase the Docker memory limit.

If you are running the local playground in Docker on a Windows machine using WSL, you can increase the memory limit by [configuring](https://learn.microsoft.com/en-us/windows/wsl/wsl-config#example-wslconfig-file) your `.wslconfig` file.
