# Rafiki

<img width="920" alt="rafiki" src="https://user-images.githubusercontent.com/3362563/119590055-e3347580-bd88-11eb-8ae7-958075433e48.png">

## What is Rafiki?

Rafiki is an open source package that exposes a comprehensive set of
Interledger APIs. It's intended to be run by wallet providers, allowing them to
offer Interledger functionality to their users.

Rafiki is made up of several components including an Interledger connector, a
high-throughput accounting database, and an API which can be accessed directly
by users to implement Interledger applications.

Rafiki also allows for delegated access, offering OAuth-based flows to grant
third-party applications access to Interledger functionality on a user's
account.

### New to interledger?

Never heard of Interledger before, or you would like to learn more? Here are some good places to start:

- [Good first issues](https://github.com/interledger/rafiki/contribute)
- [Interledger Explainer Video](https://twitter.com/Interledger/status/1567916000074678272)
- [Interledger Website](https://interledger.org/)
- [Payment pointers](https://paymentpointers.org/)
- [Web monetization](https://webmonetization.org/)
- [Coil developers](https://developers.coil.com/)

## Contributing

Please read the [contribution guidelines](.github/contributing.md) before submitting contributions. All contributions must adhere to our [code of conduct](.github/code_of_conduct.md).

## Planning Calls

Our planning calls are open to our community. We have them every Monday at 16:00 GMT, via Google Meet.

**Google Meet joining info**

Video call link: https://meet.google.com/rdx-xoqn-iiq

Or dial: ‪(US) +1 408-831-2432‬ PIN: ‪472 676 485‬#

More phone numbers: https://tel.meet/rdx-xoqn-iiq?pin=3263008843276

[Add to Google Calendar](https://calendar.google.com/event?action=TEMPLATE&tmeid=NXVsMWhsb3NnbG9hbDFkazE0dTBhZGZ1Z25fMjAyMjAzMjFUMTcwMDAwWiBjX2NqMDI3Z21oc3VqazkxZXZpMjRkOXB2bXQ0QGc&tmsrc=c_cj027gmhsujk91evi24d9pvmt4%40group.calendar.google.com&scp=ALL)

## Local Development Environment

### Prequisites

- [Docker](https://docs.docker.com/get-docker/)
- [NVM](https://github.com/nvm-sh/nvm)

### Environment Setup

```sh
# install node 16
nvm install lts/gallium
nvm use lts/gallium

# install pnpm
corepack enable

# if moving from yarn run
pnpm clean

# install dependencies
pnpm i

# build all the packages in the repo:
pnpm -r build
# build specific package (backend):
pnpm --filter backend build

# run individual tests
pnpm --filter backend test
pnpm --filter auth test
pnpm --filter open-api test

# run all tests
pnpm -r --workspace-concurrency=1 test

# pull in latest openapi specs for auth server:
pnpm --filter auth fetch-schemas

# format and lint code:
pnpm format

# check lint and formatting
pnpm checks

# verify code formatting:
pnpm check:format

# verify lint
pnpm check:lint
```

### Local Development

The [infrastructure/local](infrastructure/local) directory contains resources for setting up Rafiki in
common configurations.

```sh
# set up two instances of Rafiki
pnpm localenv up -d

# seed the postgres databases with the auth data creating an admin token
pnpm localenv:seed:auth

# tear down
pnpm localenv down

# delete database volumes (containers must be removed first with e.g. pnpm localenv down)
pnpm localenv:dbvolumes:remove
```

The local environment consists of a primary Rafiki instance and a secondary Rafiki instance, each with
its own docker compose files ([primary](infrastructure/local/docker-compose.yml), [secondary](infrastructure/local/peer-docker-compose.yml)).
The primary `docker-compose.yml` includes the main Rafiki services `backend`, `auth`, and `rates`, as well
as the required data stores tigerbeetle, redis, and postgres, so it can be run on its own.
The `peer-docker-compose.yml` includes only the Rafiki services, not the data stores. It uses the
data stores created by the primary Rafiki instance so it can't be run by itself.
The `pnpm run localenv` command starts both the primary instance and the secondary.
