# RAIO backend api

## Local Development

### Prerequisites

- [Docker](https://docs.docker.com/engine/install/) configured to [run as non-root user](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)
- If you are running MacOS on a non apple silicon device there is a known [issue](https://github.com/coilhq/tigerbeetle/issues/92) with [testcontainers](https://github.com/testcontainers/testcontainers-node) when running [tigerbeetle](https://github.com/coilhq/tigerbeetle). To fix this you can set defaults in `$HOME/.docker/daemon.json` with

  ```
  "default-ulimits": {
    "memlock": {
      "Hard": -1,
      "Name": "memlock",
      "Soft": -1
    }
  },
  ```

  and then restart docker.

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

## Configuration

### Redis connection

The connection can be configured by specifying the following environment variables.
The config is passed to `ioredis` - see https://github.com/luin/ioredis#tls-options.

| Variable                 | Description                                        | Default                  |
| ------------------------ | -------------------------------------------------- | ------------------------ |
| REDIS_URL                | Redis connection string.                           | "redis://127.0.0.1:6379" |
| REDIS_TLS_CA_FILE_PATH   | Path to CA certificate - overrides well-known CAs. | ""                       |
| REDIS_TLS_KEY_FILE_PATH  | Path to private key for client authentication.     | ""                       |
| REDIS_TLS_CERT_FILE_PATH | Path to certificate for client authentication.     | ""                       |
