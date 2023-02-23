# Local Playground

This environment will set up an environment where you can use the Open Payments API and the Rafiki
admin GraphQL.

Prerequisites:

- [Rafiki local environment setup](../../README.md#environment-setup)
- [docker](https://docs.docker.com/get-docker/)
- [compose plugin](https://docs.docker.com/compose/install/compose-plugin/)
- [postman](https://www.postman.com/downloads/)

The following should be run from the root of the project.

```
// If you have spun up this environment before then run
pnpm localenv:stop && pnpm localenv:dbvolumes:database:remove

// Start the local environment
pnpm localenv:start

// tear down
pnpm localenv:stop

// delete database volumes (containers must be removed first with e.g. pnpm localenv:stop)
pnpm localenv:dbvolumes:remove
```

If you want to use Postgres as the accounting database instead of Tigerbeetle, you can append `psql` to the `localenv:` commands:

```
pnpm localenv:psql:start
pnpm localenv:psql:stop
```

The local environment consists of a primary Rafiki instance and a secondary Rafiki instance, each with
its own docker compose files ([primary](./docker-compose.yml), [secondary](./peer-docker-compose.yml)).
The primary `docker-compose.yml` includes the main Rafiki services `backend`, `auth`, and `rates`, as well
as the required data stores tigerbeetle, redis, and postgres, so it can be run on its own.
The `peer-docker-compose.yml` includes only the Rafiki services, not the data stores. It uses the
data stores created by the primary Rafiki instance so it can't be run by itself.
The `pnpm run localenv` command starts both the primary instance and the secondary.

## P2P payment

This will demonstrate a P2P payment from Grace Franklin (Fynbos account) to Philip Fry (local bank account) using
the requests in the `Peer-to-peer transfer` folder of the Postman collection.

Grace's payment pointer can be found in the logs for `fynbos` and must be used to set the `gfranklinPaymentPointer` variable in a Postman environment.
Philip's payment pointer can be found in the `local-bank` logs and used to set the `pfryPaymentPointer` Postman environment variable.

```
pnpm localenv logs -f fynbos local-bank
```

Run through the following requests in the `Peer-to-peer transfer` folder to:

- Create an incoming payment on Philip Fry's payment pointer.
- Create a quote on Grace Fry's payment pointer.
- Create an outgoing payment on Grace Fry's payment pointer.

## Environment overview

![Docker compose environment](./local-dev.png)

a - accessible at http://localhost:3001/graphql

b - accessible at http://localhost:3000

c - accessible at http://localhost:4001/graphql

d - accessible at http://localhost:4000

e - accessible at localhost:5432
