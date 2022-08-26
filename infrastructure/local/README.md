# Local Playground

This environment will set up an environment where you can use the Open Payments API and the Rafiki
admin GraphQL.

Prerequisites:
- [docker](https://docs.docker.com/get-docker/)
- [compose plugin](https://docs.docker.com/compose/install/compose-plugin/) 
- [postman](https://www.postman.com/downloads/)

The following should be run from the root of the project.
```

// If you have spun up this environment before then run
pnpm localenv down && pnpm localenv:dbvolumes:remove

// Start the local environment
pnpm localenv up -d

// Seed auth tokens
pnpm localenv:seed:auth
```

## P2P payment
This will demonstrate a P2P payment from Grace Franklin (Fynbos account) to Philip Fry (local bank account).

```
// look up payment pointer for Grace Franklin and set in Postman environment
pnpm localenv logs fynbos

// look up payment pointer for Philip Fry and set in Postman environment
pnpm localenv logs local-bank
```

- Create an incoming payment on Philip Fry's payment pointer.
- Create a quote on Grace Fry's payment pointer.
  - double check the expiry
- Create an outgoing payment on Grace Fry's payment pointer.

## Environment overview
![Docker compose environment](./local-dev.png)
