# RAIO ilp connector

## Local Development

From the monorepo root directory:

```shell
# Run database
docker-compose -f packages/connector/docker-compose.yml up -d

# Run tests
yarn workspace connector test

# Or if running on Linux kernel <v5.6
yarn workspace connector test:skip-tigerbeetle

# Clean up
docker-compose -f packages/connector/docker-compose.yml stop
docker-compose -f packages/connector/docker-compose.yml rm
```
