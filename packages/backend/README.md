# RAIO backend api

## Local Development

### Prerequisites

- [Docker](https://docs.docker.com/engine/install/) configured to [run as non-root user](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)
- If you are running MacOS, there is a known [issue](https://github.com/coilhq/tigerbeetle/issues/92). [TigerBeetle](https://github.com/coilhq/tigerbeetle) requires the privilege of using memlock functions, usually afforded by adding the linux capability (IPC_LOCK). Rafiki uses [testcontainers](https://github.com/testcontainers/testcontainers-node) which unfortunately provides no api to configure the containers for this use case. On MacOS, a workaround is update the defaults in `$HOME/.docker/daemon.json` with

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
pnpm --filter backend test
```

## Docker build

In order to build the docker container run the following command.

```shell
# from the root:
docker build -f packages/backend/Dockerfile -t rafiki-backend .
```

## Configuration

### Redis Connection

The connection can be configured by specifying the following environment variables.
The config is passed to `ioredis` - see https://github.com/luin/ioredis#tls-options.

| Variable                 | Description                                        | Default                  |
| ------------------------ | -------------------------------------------------- | ------------------------ |
| REDIS_URL                | Redis connection string.                           | "redis://127.0.0.1:6379" |
| REDIS_TLS_CA_FILE_PATH   | Path to CA certificate - overrides well-known CAs. | ""                       |
| REDIS_TLS_KEY_FILE_PATH  | Path to private key for client authentication.     | ""                       |
| REDIS_TLS_CERT_FILE_PATH | Path to certificate for client authentication.     | ""                       |

### Design

[![](https://mermaid.ink/img/pako:eNqNVD1vwjAQ_SuRBxQkUHcGpCI6dGqqMrXpYJIjWE1sap8HhPjv9Uccx1GQypCc77179-ELN1KJGsiGNJJeztlhX_LM_JQ-eseRVj_Aa-995ZXoGG_yYBT02gHHpYffNDbCwsFI4XctEHL37D09XhgugszTY895riqhOVrZaAZMKcDcPYMiWB2YRqv97iuEq-W3xw6ScnUC6cDhEFCn6sKsMbjTGi2eegZiGJGlTMY1cMKcLGcys4Hj5mUJzoh1QJ8dZnJm6_V2VMAMmBadVuMILtuogodREe0rnRGLfcbivaDrYm6y2cLfgHkPUovYwyJoZC371axmeM2ov18nHFdldJuWbl7Ygk30kD9bjiNZkelWWtFCKGwkqKcDa0DuAEyKsawKPf4zbLSZD4uZLmLa5zbsr3ebL5isSAeyo6w2H_vNukuCZzOJkmyMWcOJ6hZLUvK7oepLTRFezFyFJBuUGlaEahQfV16Fs-fsGTX_FF1wXij_FMIcT7RVcP8DQHN1Og?type=png)](https://mermaid-js.github.io/mermaid-live-editor/edit#pako:eNqNVD1vwjAQ_SuRBxQkUHcGpCI6dGqqMrXpYJIjWE1sap8HhPjv9Uccx1GQypCc77179-ELN1KJGsiGNJJeztlhX_LM_JQ-eseRVj_Aa-995ZXoGG_yYBT02gHHpYffNDbCwsFI4XctEHL37D09XhgugszTY895riqhOVrZaAZMKcDcPYMiWB2YRqv97iuEq-W3xw6ScnUC6cDhEFCn6sKsMbjTGi2eegZiGJGlTMY1cMKcLGcys4Hj5mUJzoh1QJ8dZnJm6_V2VMAMmBadVuMILtuogodREe0rnRGLfcbivaDrYm6y2cLfgHkPUovYwyJoZC371axmeM2ov18nHFdldJuWbl7Ygk30kD9bjiNZkelWWtFCKGwkqKcDa0DuAEyKsawKPf4zbLSZD4uZLmLa5zbsr3ebL5isSAeyo6w2H_vNukuCZzOJkmyMWcOJ6hZLUvK7oepLTRFezFyFJBuUGlaEahQfV16Fs-fsGTX_FF1wXij_FMIcT7RVcP8DQHN1Og)
