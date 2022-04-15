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

## GNAP Endpoints

The authorization service extends the following endpoints:

- `POST /grant/start`: Initializes a grant request for a client.
- `POST /grant/continue`: Continues a grant request after a resource owner has authorized said grant request.
- `POST /introspect`: Performs introspection an access token and determines if it is valid.
- `POST /token/:managementId`: Rotates an access token and issues a new one.
- `DEL /token/:managementId`: Revokes an access token.
