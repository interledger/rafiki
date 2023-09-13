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

COPY pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"

FROM base AS prod-deps

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY localenv/mock-account-servicing-entity/package.json ./localenv/mock-account-servicing-entity/package.json

RUN pnpm clean
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --recursive \
    --prefer-offline \
    --frozen-lockfile \
    --prod \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"

FROM base AS builder   

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.build.json ./
COPY localenv/mock-account-servicing-entity ./localenv/mock-account-servicing-entity

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --recursive \
    --offline \
    --frozen-lockfile
RUN pnpm --filter mock-account-servicing-entity build

FROM node:18-alpine3.18 AS runner

WORKDIR /home/rafiki

COPY localenv/cloud-nine-wallet/seed.yml ./localenv/cloud-nine-wallet/seed.yml
COPY localenv/happy-life-bank/seed.yml ./localenv/happy-life-bank/seed.yml

COPY --from=prod-deps /home/rafiki/node_modules ./node_modules
COPY --from=prod-deps /home/rafiki/localenv/mock-account-servicing-entity/node_modules ./localenv/mock-account-servicing-entity/node_modules
COPY --from=prod-deps /home/rafiki/localenv/mock-account-servicing-entity/package.json ./localenv/mock-account-servicing-entity/package.json

COPY --from=builder /home/rafiki/localenv/mock-account-servicing-entity/build ./localenv/mock-account-servicing-entity/build
COPY --from=builder /home/rafiki/localenv/mock-account-servicing-entity/public ./localenv/mock-account-servicing-entity/public

WORKDIR /home/rafiki/localenv/mock-account-servicing-entity
CMD ["sh", "./node_modules/.bin/remix-serve", "build"]