# Rafiki and Tigerbeetle

TigerBeetle is a distributed financial accounting database designed for mission critical safety and performance. Since Rafiki implements the [Interledger Protocol](./glossary.md#interledger-protocol), which splits payments into packets, we need a high performing and safe database to store all that payment data. For detailed information on Tigerbeetle, including its consesus mechanism and its limitations, visit the official Tigerbeetle [documentation](https://docs.tigerbeetle.com/) and [blog](https://tigerbeetle.com/blog/).

Rafiki uses a combination of liquidity and settlement accounts to perform double-entry accounting. These accounts correspond to Tigerbeetle credit and debit accounts, respectively. For more information on Rafiki's accounting, refer to [Accounts and Transfers](./accounts-and-transfers.md). Note that Tigerbeetle only holds balance data an no additional metadata included in ILP packets. Such metadata is stored in a [Redis](https://redis.io/) database.

## Changing Tigerbeetle Version within Rafiki

### Production Environment - Helm charts

To use the desired version of Tigerbeetle within the production environment, change the tag in the [helm `values.yaml` file](../infrastructure/helm/tigerbeetle/values.yaml) (line 29).

### Local Environment

To use the desired version of Tigerbeetle within the local environment, change the tag in the [tigerbeetle `docker-compose.yml` file](../infrastructure/local/tigerbeetle/docker-compose.yml) (line 4).

### Tests

To use the desired version of Tigerbeetle within the Rafiki tests, change the tag in the [tigerbeetle test setup](../packages/backend/src/tests/tigerbeetle.ts) (line 20 and line 52).
