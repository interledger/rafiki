---
title: Autopeering
---

If you want to start one local instance of Rafiki and peer it automatically to rafiki.money, you can run the following commands:

```
pnpm localenv:compose:autopeer -d

// OR to start with Postgres db
pnpm localenv:compose:psql:autopeer -d
```

Your local Rafiki instance will be peered automatically with https://rafiki.money instance.
The required services will be exposed externally using [tunnelmole](https://www.npmjs.com/package/tunnelmole) package.
The exposed ports are 3000(open-payments), 3006(auth server), 3002(ILP connector).

To use the [Postman API examples](./overview.md#postman--open-payments-apis) follow the steps:

1. run `docker logs rafiki-cloud-nine-mock-ase-1`
2. find the list of created wallet addresses
3. copy the url of one of the wallet addresses
4. set the url into `senderWalletAddress` postman variable in `Remote Environment`

To shut down the connection and to clear the environment run

```
pnpm localenv:compose down --volumes
```

This is necessary as on a new run of the scripts (with autopeering or not) the wallet address url will differ.
