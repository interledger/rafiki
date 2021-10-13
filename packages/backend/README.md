# RAIO backend api

## Local Development

### Prerequisites

- [Docker](https://docs.docker.com/engine/install/) configured to [run as non-root user](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)

### Testing

From the monorepo root directory:

```shell
yarn workspace backend test
```

## Docker build

In order to build the docker container run the following command.

```shell
yarn docker build backend -t rafiki-backend
```
