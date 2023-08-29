FROM node:18-alpine AS base

WORKDIR /home/rafiki

RUN corepack enable
RUN corepack prepare pnpm@7.25.1 --activate
RUN apk add --no-cache \
    python3 \
    make \
    g++

COPY pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm fetch \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"

FROM base AS prod-deps

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/token-introspection/package.json ./packages/token-introspection/package.json

RUN pnpm clean
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install \
    --recursive \
    --prefer-offline \
    --frozen-lockfile \
    --prod \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"

FROM base AS builder   

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.build.json ./
COPY openapi ./openapi
COPY packages/auth ./packages/auth
COPY packages/token-introspection ./packages/token-introspection

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install \
    --recursive \
    --offline \
    --frozen-lockfile
RUN pnpm --filter auth build

FROM node:18-alpine AS runner

WORKDIR /home/rafiki

COPY --from=prod-deps /home/rafiki/node_modules ./node_modules
COPY --from=prod-deps /home/rafiki/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=prod-deps /home/rafiki/packages/auth/package.json ./packages/auth/package.json
COPY --from=prod-deps /home/rafiki/packages/token-introspection/node_modules ./packages/token-introspection/node_modules
COPY --from=prod-deps /home/rafiki/packages/token-introspection/package.json ./packages/token-introspection/package.json

COPY --from=builder /home/rafiki/openapi ./openapi
COPY --from=builder /home/rafiki/packages/auth/migrations/ ./packages/auth/migrations
COPY --from=builder /home/rafiki/packages/token-introspection/src/openapi/token-introspection.yaml ./packages/token-introspection/src/openapi/token-introspection.yaml
COPY --from=builder /home/rafiki/packages/auth/dist ./packages/auth/dist
COPY --from=builder /home/rafiki/packages/token-introspection/dist ./packages/token-introspection/dist


CMD ["node", "/home/rafiki/packages/auth/dist/index.js"]