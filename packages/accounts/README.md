# RAIO accounts service API

## Local Development

From the monorepo root directory:

```shell
# Run database
docker-compose -f packages/accounts/docker-compose.yml up -d

# Run tests
yarn workspace accounts test

# Clean up
docker-compose -f packages/accounts/docker-compose.yml stop
docker-compose -f packages/accounts/docker-compose.yml rm
```
