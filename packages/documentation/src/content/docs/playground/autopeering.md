---
title: Auto-Peering
---

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

To use the Open Payments example in the [Bruno API examples](/playground/overview/#bruno--open-payments-apis), follow these steps:

1. navigate to http://localhost:3030 to find the list of created wallet addresses (alternatively, run `docker logs rafiki-cloud-nine-mock-ase-1`)
2. copy the url of one of the wallet addresses
3. set the url as `senderWalletAddress` variable in the Bruno `Autopeering` environment

Note that you have to go through an additional "login" step by providing you IPv4 address as tunnel password before being able to visit the consent screen for the outgoing payment grant request. You can find out your current IPv4 address by e.g. visiting https://loca.lt/mytunnelpassword (or https://www.whatismyip.com/).

To shut down the connection and to clear the environment, run

```sh
pnpm localenv:compose down --volumes
```

This is necessary since on a new run of the scripts (with autopeering or not), the wallet address urls will differ.
