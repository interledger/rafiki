# Rafiki and TigerBeetle

TigerBeetle is a distributed financial accounting database designed for mission critical safety and performance. Since Rafiki implements the [Interledger Protocol](./glossary.md#interledger-protocol), which splits payments into packets, we need a high performing and safe database to store all that payment data. For detailed information on TigerBeetle, including its consensus mechanism and its limitations, visit the official TigerBeetle [documentation](https://docs.tigerbeetle.com/) and [blog](https://tigerbeetle.com/blog/).

Rafiki uses a combination of liquidity and settlement accounts to perform double-entry accounting. These accounts correspond to TigerBeetle credit and debit accounts, respectively. For more information on Rafiki's accounting, refer to [Accounts and Transfers](./accounts-and-transfers.md). Note that TigerBeetle only holds balance data and not any other additional metadata included in ILP packets.

## Changing TigerBeetle Version within Rafiki

### Updating the node client

```sh
# latest
pnpm --filter backend up tigerbeetle-node --latest

# specific version
pnpm --filter backend up tigerbeetle-node@0.12.24
```

### Production Environment - Helm charts

To use the desired version of TigerBeetle within the production environment, change the tag in the [helm `values.yaml` file](../infrastructure/helm/tigerbeetle/values.yaml).

### Local Environment

To use the desired version of TigerBeetle within the local environment, change the tag in the [tigerbeetle `docker-compose.yml` file](../infrastructure/local/tigerbeetle/docker-compose.yml).

### Tests

To use the desired version of TigerBeetle within the Rafiki tests, change the tag in the [tigerbeetle test setup](../packages/backend/src/tests/tigerbeetle.ts).
