FROM node:18-alpine3.18 AS base

WORKDIR /home/rafiki

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
RUN corepack prepare pnpm@8.7.4 --activate
RUN apk add --no-cache \
    python3 \
    make \
    g++

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.build.json pnpm-lock.yaml ./
COPY openapi ./openapi
COPY packages/auth ./packages/auth
COPY packages/token-introspection ./packages/token-introspection

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --recursive \
    --offline \
    --frozen-lockfile

FROM base AS prod-deps

RUN pnpm add -g typescript

RUN pnpm clean
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --recursive \
    --prefer-offline \
    --frozen-lockfile \
    --prod \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"

FROM base AS builder   

RUN pnpm --filter auth build

FROM node:18-alpine3.18 AS runner

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