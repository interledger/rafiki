# RAIO ilp connector

## Local Development

From the monorepo root directory:

```shell
# Run database
docker-compose --project-directory packages/connector up -d

# Run tests
yarn workspace connector test

# Clean up
docker-compose --project-directory packages/connector stop
docker-compose --project-directory packages/connector rm
```
