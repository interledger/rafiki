FROM node:18-alpine AS base

WORKDIR /home/rafiki

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
RUN corepack prepare pnpm@7.25.1 --activate
RUN apk add --no-cache \
    python3 \
    make \
    g++

COPY pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"

FROM base AS prod-deps

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY localenv/local-http-signatures/package.json ./localenv/local-http-signatures/package.json

RUN pnpm clean
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --recursive \
    --frozen-lockfile \
    --prod \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"

FROM base AS builder   

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.build.json ./
COPY openapi ./openapi
COPY localenv/local-http-signatures ./localenv/local-http-signatures

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --recursive \
    --prefer-offline \
    --offline \
    --frozen-lockfile
RUN pnpm --filter local-http-signatures build

FROM node:18-alpine AS runner

WORKDIR /home/rafiki

COPY --from=prod-deps /home/rafiki/node_modules ./node_modules
COPY --from=prod-deps /home/rafiki/localenv/local-http-signatures/node_modules ./localenv/local-http-signatures/node_modules
COPY --from=prod-deps /home/rafiki/localenv/local-http-signatures/package.json ./localenv/local-http-signatures/package.json

COPY --from=builder /home/rafiki/localenv/local-http-signatures/dist ./localenv/local-http-signatures/dist

CMD ["node", "/home/rafiki/localenv/local-http-signatures/dist/app.js"]
