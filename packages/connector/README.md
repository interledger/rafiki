# RAIO ilp connector

## Local Development

From the monorepo root directory:

```shell
# Run database
docker-compose -f packages/connector/docker-compose.yml up -d

# Run tests
yarn workspace connector test

# Clean up
docker-compose -f packages/connector/docker-compose.yml stop
docker-compose -f packages/connector/docker-compose.yml rm
```
