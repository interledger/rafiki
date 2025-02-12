# Rafiki

![Rafiki](https://github.com/interledger/rafiki/assets/20246798/528b1978-0e02-4bc4-a6b4-e8e81d2f3c3a)

## What is Rafiki?

Rafiki is open source software that provides an efficient solution for an [account servicing entity](https://rafiki.dev/resources/glossary#account-servicing-entity-ase) to enable Interledger functionality on its users' accounts.

This includes

- sending and receiving payments (via [SPSP](https://rafiki.dev/resources/glossary#simple-payment-setup-protocol-spsp) and [Open Payments](https://rafiki.dev/overview/concepts/open-payments))
- allowing third-party access to initiate payments and view transaction data (via [Open Payments](https://rafiki.dev/overview/concepts/open-payments))

**❗ Rafiki is intended to be run by account servicing entities only and should not be used in production by non-regulated entities.**

Rafiki is made up of several components, including an Interledger connector, a high-throughput accounting database called [TigerBeetle](https://rafiki.dev/overview/concepts/accounting#tigerbeetle), and several APIs:

- the [Admin APIs](https://rafiki.dev/apis/graphql/admin-api-overview) to create [peering relationships](https://rafiki.dev/overview/concepts/interledger#peers),
  add supported [assets](https://rafiki.dev/overview/concepts/accounting#assets), and issue [wallet addresses](https://rafiki.dev/resources/glossary#wallet-address)
- the [Open Payments](https://rafiki.dev/overview/concepts/open-payments) API to allow third parties (with the account holder's consent) to initiate payments and to view the transaction history
- the [SPSP](https://rafiki.dev/resources/glossary#simple-payment-setup-protocol-spsp) API for simple Interledger Payments

Additionally, this package also includes a reference implementation of a [GNAP](https://rafiki.dev/resources/glossary#grant-negotiation-and-authorization-protocol-gnap) authorization server, which handles the access control for the Open Payment API. For more information on the architecture, check out the [Architecture documentation](https://rafiki.dev/resources/architecture).

### New to Interledger?

Never heard of Interledger before? Or would you like to learn more? Here are some excellent places to start:

- [Interledger Website](https://interledger.org/)
- [Interledger Specs](https://interledger.org/rfcs/0027-interledger-protocol-4/)
- [Interledger Explainer Video](https://twitter.com/Interledger/status/1567916000074678272)
- [Open Payments](https://openpayments.dev/)
- [Web Monetization](https://webmonetization.org/)

## Contributing

Please read the [contribution guidelines](.github/contributing.md) before submitting contributions. All contributions must adhere to our [code of conduct](.github/code_of_conduct.md).

## Community Calls

Our Rafiki community calls are open to our community members. We have them every Tuesday at 15:30 GMT, via Google Meet.

**Google Meet joining info**

Video call link: https://meet.google.com/sms-fwny-ezc

Or dial: ‪(GB) +44 20 3956 0467‬ PIN: ‪140 111 239‬#

More phone numbers: https://tel.meet/sms-fwny-ezc?pin=5321780226087

[Add to Google Calendar](https://calendar.google.com/calendar/event?action=TEMPLATE&tmeid=YjN1NW5ibDloN2dua2IwM2thOWlrZXRvMTVfMjAyMzA0MTdUMTUwMDAwWiBjX2NqMDI3Z21oc3VqazkxZXZpMjRkOXB2bXQ0QGc&tmsrc=c_cj027gmhsujk91evi24d9pvmt4%40group.calendar.google.com&scp=ALL)

## Local Development Environment

### Prerequisites

- [Git](https://git-scm.com/downloads) for version control
- [Docker](https://docs.docker.com/get-docker/) to run containerized services
- [Node Version Manager (NVM)](https://github.com/nvm-sh/nvm) to manage Node.js versions

### Environment Setup

After you have Git, Docker, and NVM installed, run the following commands to continue setting up your local development environment.

Clone the Rafiki repository

```sh
git clone https://github.com/interledger/rafiki.git
cd rafiki
```

Install Node.js

```sh
nvm install
nvm use
```

Install [pnpm](https://pnpm.io/installation) -- a quick and efficient Node.js package manager

```sh
corepack enable
```

If you were previously using Yarn as a package manager, run this:

```sh
pnpm clean
```

Install dependencies

```sh
pnpm i
```

### Local Development

The Rafiki local environment is the best way to explore Rafiki locally. The [localenv](localenv) directory contains instructions for setting up a local playground. Please refer to the README for each individual package for more details.

### Useful commands

| Description                                             | Command                                  |
| ------------------------------------------------------- | ---------------------------------------- |
| Build all of the packages in the repo                   | `pnpm -r build`                          |
| Build a specific package (e.g. backend, frontend, etc.) | `pnpm --filter backend build`            |
| Generate types from specific package GraphQL schema     | `pnpm --filter backend generate`         |
| Run individual tests (e.g. backend)                     | `pnpm --filter backend test`             |
| Run all tests                                           | `pnpm -r --workspace-concurrency=1 test` |
| Format and lint code                                    | `pnpm format`                            |
| Check lint and formatting                               | `pnpm checks`                            |
| Verify code formatting                                  | `pnpm check:prettier`                    |
| Verify lint                                             | `pnpm check:lint`                        |
