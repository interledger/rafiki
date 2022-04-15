# Authorization Server

The authorization server used to issue authorizations for Open Payments actions.

## Local Development

### Prerequisites

- [Docker](https://docs.docker.com/engine/install/) configured to [run as non-root user](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)

## Docker build

In order to build the docker container run the following command.

```shell
yarn docker build auth -t rafiki-auth
```
