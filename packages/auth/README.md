# Authorization Server

The authorization server used to issue authorizations for Open Payments actions.
Implements Open Payments authorization endpoints in accordance with the GNAP spec for an AS:

- https://github.com/interledger/open-payments/blob/master/auth-server-open-api-spec.yaml
- https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol
=======
>>>>>>> 08c8705 (feat(auth): initialize package)

## Local Development

### Prerequisites

- [Docker](https://docs.docker.com/engine/install/) configured to [run as non-root user](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user)

## Docker build

In order to build the docker container run the following command.

```shell
yarn docker build auth -t rafiki-auth
```
<<<<<<< HEAD

## GNAP Endpoints

The authorization service extends the following endpoints:

- `POST /auth`: Initializes a grant request for a client.
- `POST /auth/continue/:id`: Continues a grant request after a resource owner has authorized said grant request.
- `POST /introspect`: Performs introspection an access token and determines if it is valid.
- `POST /auth/token/:id`: Rotates an access token and issues a new one.
- `DEL /auth/token/:id`: Revokes an access token.
