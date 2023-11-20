---
title: Auto-Peering
---

If you want to start one local instance of Rafiki and peer it automatically to [Rafiki.money](https://rafiki.money), you can run the following commands:

```
// using Tigerbeetle DB
pnpm localenv:compose:autopeer

// OR usingPostgres DB
pnpm localenv:compose:psql:autopeer
```

Your local Rafiki instance will be automatically peered with the remote [Rafiki.money](https://rafiki.money) instance.
The required services will be exposed externally using the [tunnelmole](https://www.npmjs.com/package/tunnelmole) package.
The exposed ports are 3000(open-payments), 3006(auth server), 3002(ILP connector).

To use the [Postman API examples](/playground/overview/#postman--open-payments-apis), follow these steps:

1. run `docker logs rafiki-cloud-nine-mock-ase-1` (alternatively, check http://localhost:3030)
2. find the list of created wallet addresses
3. copy the url of one of the wallet addresses
4. set the `senderWalletAddress` variable in the Postman `Remote Environment` to that wallet address

To shut down the connection and to clear the environment, run

```
pnpm localenv:compose down --volumes
```

This is necessary since on a new run of the scripts (with autopeering or not), the wallet address urls will differ.
