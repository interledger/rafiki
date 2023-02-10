# Rafiki Admin UI

## Development

This project assumes that you have a local Rafiki backend instance up and running. See the `Environment Setup` and `Local Development` sections in the main [README](../../README.md) and the `Local Playground` section in the infrastructure/local [README](../../infrastructure/local/README.md).

To start the project in development mode, we first need to generate the GraphQL types for our queries and mutations.

To generate the GraphQL types file run:

```sh
pnpm --filter backend generate
```

To start the application run:

```sh
pnpm --filter admin dev
```

Now you can access the application on [http://localhost:3005](http://localhost:3005).

---

To lint code:

```sh
pnpm lint:fix

# Or

pnpm lint:check
```
