# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Rafiki is an open-source Interledger-enabled payment system. It is a pnpm monorepo (Node 24, pnpm 10.33+) implementing the Open Payments standard, GNAP authorization, and ILP (Interledger Protocol) connectivity.

## Commands

### Install dependencies

```bash
pnpm install
```

### Build

```bash
pnpm build                          # Build all packages from root (tsc --build)
pnpm --filter backend build         # Build a single package
```

### Lint & format

```bash
pnpm check:lint                     # Check lint (no fix)
pnpm check:prettier                 # Check formatting
pnpm lint                           # Lint with auto-fix
pnpm format                         # Prettier + lint fix
```

### Tests

```bash
# From root - runs all packages
pnpm -r test

# From a package directory (or using filter):
pnpm --filter backend test
pnpm --filter auth test

# Single test file (from repo root):
NODE_OPTIONS=--experimental-vm-modules pnpm --filter backend jest path/to/test.test.ts

# With coverage:
pnpm --filter backend test:cov

# Only tests changed since main branch:
pnpm --filter backend test:sincemain
```

Tests use Jest with `@swc/jest` for TypeScript transpilation. Each package has a `jest.config.js` that extends `jest.config.base.js` at the root. Integration tests use `testcontainers` to spin up PostgreSQL/Redis.

### Database migrations (backend & auth)

```bash
pnpm --filter backend knex migrate:latest
pnpm --filter auth knex migrate:latest
pnpm --filter backend knex migrate:rollback
```

### GraphQL codegen

```bash
pnpm --filter backend generate
pnpm --filter auth generate
```

### Local development environment

```bash
# Standard TigerBeetle-based stack (cloud-nine + happy-life-bank)
pnpm localenv:compose up -d

# With additional wallets/banks:
pnpm localenv:compose:multihop up -d
pnpm localenv:compose:multitenancy up -d
pnpm localenv:compose:partial-payment up -d
pnpm localenv:compose:telemetry up -d
pnpm localenv:compose:adminauth up -d

# PostgreSQL-only accounting (no TigerBeetle):
pnpm localenv:compose:psql up -d

# Seed auth database after starting:
pnpm localenv:seed:auth

# Auto-peering via localtunnel (requires internet):
pnpm localenv:compose:autopeer
```

## Architecture

### Package structure

| Package                             | Purpose                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/backend`                  | Core Interledger node: ILP connector, Open Payments resource server, Admin GraphQL API |
| `packages/auth`                     | GNAP authorization server for Open Payments grants                                     |
| `packages/frontend`                 | React/Remix admin UI (uses Ory Kratos for identity)                                    |
| `packages/token-introspection`      | Lightweight token introspection client library (published to npm)                      |
| `packages/mock-account-service-lib` | Shared library for mock Account Servicing Entities                                     |
| `packages/card-service`             | Card payment service                                                                   |
| `packages/point-of-sale`            | POS application                                                                        |

### Backend service architecture

The backend uses **IoC (Inversion of Control)** via `@adonisjs/fold`. All services are registered in `packages/backend/src/index.ts` via `initIocContainer()` and consumed via `container.use('serviceName')`.

The backend exposes three HTTP servers:

- **Admin server** — GraphQL API (Apollo Server + Koa) for managing assets, peers, wallet addresses, payments
- **Open Payments server** — REST API implementing the Open Payments specification (incoming payments, quotes, outgoing payments, wallet addresses)
- **ILP Connector server** — Handles ILP packet routing between peers

Key modules in `packages/backend/src/`:

- `accounting/` — Dual-mode accounting: `psql/` (PostgreSQL ledger) or `tigerbeetle/` (TigerBeetle distributed ledger)
- `open_payments/` — Open Payments entities: wallet addresses, incoming/outgoing payments, quotes, grants
- `payment-method/ilp/` — ILP connector, SPSP, auto-peering, stream credentials
- `payment-method/local/` — Local (same-node) payment execution
- `tenants/` — Multi-tenancy support
- `graphql/` — Admin API schema, resolvers, and generated types
- `config/app.ts` — All configuration via environment variables

### Accounting backends

The backend supports two accounting backends configured via `USE_TIGERBEETLE`:

- **TigerBeetle** (`tigerbeetle-node`): High-performance distributed financial ledger, default in localenv
- **PostgreSQL**: Fallback accounting using Knex/Objection

### Auth (GNAP)

`packages/auth` is a standalone GNAP authorization server. It issues access tokens for Open Payments operations. The backend introspects tokens against the auth server via `packages/token-introspection`.

### Database

Both `backend` and `auth` use PostgreSQL with Knex migrations (in `migrations/` under each package) and Objection.js as the ORM. Migration files are plain `.js` files.

### Open Payments specifications

The `open-payments-specifications/` directory is a git submodule containing the OpenAPI specs used for request validation in both `backend` and `auth`.

### Local environments

`localenv/` contains Docker Compose scenarios combining:

- `cloud-nine-wallet/` — Primary wallet node (backend + auth + frontend)
- `happy-life-bank/` — Secondary wallet for cross-wallet payment testing
- `global-bank/` — Third-party bank (used in multihop scenarios)
- `tigerbeetle/` — TigerBeetle accounting cluster
- `mock-account-servicing-entity/` — Remix app simulating an ASE webhook handler
- `telemetry/` — Prometheus, Grafana, Jaeger stack

### Observability

OpenTelemetry is instrumented throughout the backend via `packages/backend/src/telemetry/`. Metrics are exported via OTLP gRPC to collectors configured in env.

## Code style

Prettier config (in root `package.json`):

- No semicolons
- Single quotes
- No trailing commas

ESLint uses `@typescript-eslint` with `max-warnings=0` enforced.
