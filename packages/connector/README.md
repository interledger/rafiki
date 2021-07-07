# RAIO ilp connector

## Local Development

From the monorepo root directory:

```shell
# Run database
docker-compose -f packages/connector/docker-compose.yml up -d

# Build accounts service
yarn workspace accounts build

# Run tests
yarn workspace connector test

# Clean up
docker-compose -f packages/connector/docker-compose.yml stop
docker-compose -f packages/connector/docker-compose.yml rm
```
