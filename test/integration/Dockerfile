FROM node:18-alpine3.18 AS base

WORKDIR /home/rafiki

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# TODO: do i need this?
# RUN apk add --no-cache \
#     python3 \
#     make \
#     g++

RUN corepack enable
RUN corepack prepare pnpm@8.7.4 --activate

# Not copying lockfile because it has some error about not finding react, coming
# from apollo/client. tried doing apollo/client/core imports only but still same error.
# https://github.com/apollographql/apollo-client/issues/7005
# I think something from our monorepo causes it to setup the pnpm-lock.yaml in a way
# that its required by apollo but not fulfilled by the test package alone. 
# This is a potential source of divergance from our tests/production though. Because it
# isn't using the commited lockfile.
# COPY pnpm-lock.yaml ./

# RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
#     pnpm fetch \
#     | grep -v "cross-device link not permitted\|Falling back to copying packages from store"

# TODO: rename to prod-deps and changes integration package.json to actually use prod/dev deps
FROM base AS deps

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY test/integration/package.json ./test/integration/package.json
COPY packages/mock-account-servicing-lib/package.json ./packages/mock-account-servicing-lib/package.json

COPY test/integration/integration.test.ts ./test/integration/integration.test.ts
COPY test/integration/lib ./test/integration/lib
COPY test/integration/jest.docker.config.js ./test/integration/jest.config.js
COPY test/integration/tsconfig.docker.json ./test/integration/tsconfig.json


RUN pnpm clean
RUN pnpm install

# TODO: install like this instead?
# RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
#     pnpm install \
#     --recursive \
#     --prefer-offline \
#     --frozen-lockfile \
#     --prod \
#     | grep -v "cross-device link not permitted\|Falling back to copying packages from store"


FROM base AS builder

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.build.json ./
COPY test/integration ./test/integration
COPY packages/mock-account-servicing-lib ./packages/mock-account-servicing-lib

# TODO: install like this instead?
# RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
#     pnpm install \
#     --recursive \
#     --offline \
#     --frozen-lockfile
RUN pnpm install    
# RUN pnpm --filter integration build:deps
RUN pnpm --filter mock-account-servicing-lib build


FROM node:18-alpine3.18 AS runner

WORKDIR /home/rafiki

# TODO: can I just do COPY test/integration ./test/integration? what does that include that
# I don't want? anything?
# COPY test/integration ./test/integration

COPY test/integration/testenv/private-key.pem ./test/integration/testenv/private-key.pem
COPY test/integration/testenv/cloud-nine-wallet/seed.yml ./test/integration/testenv/cloud-nine-wallet/seed.yml
COPY test/integration/testenv/cloud-nine-wallet/.env ./test/integration/testenv/cloud-nine-wallet/.env
COPY test/integration/testenv/happy-life-bank/seed.yml ./test/integration/testenv/happy-life-bank/seed.yml
COPY test/integration/testenv/happy-life-bank/.env ./test/integration/testenv/happy-life-bank/.env
COPY test/integration/integration.test.ts ./test/integration/integration.test.ts
COPY test/integration/lib ./test/integration/lib
COPY test/integration/jest.docker.config.js ./test/integration/jest.config.js
COPY test/integration/tsconfig.docker.json ./test/integration/tsconfig.json

COPY --from=deps /home/rafiki/node_modules ./node_modules
COPY --from=deps /home/rafiki/test/integration/node_modules ./test/integration/node_modules
COPY --from=deps /home/rafiki/test/integration/package.json ./test/integration/package.json
COPY --from=deps /home/rafiki/packages/mock-account-servicing-lib/node_modules ./packages/mock-account-servicing-lib/node_modules
COPY --from=deps /home/rafiki/packages/mock-account-servicing-lib/package.json ./packages/mock-account-servicing-lib/package.json

COPY --from=builder /home/rafiki/packages/mock-account-servicing-lib/dist ./packages/mock-account-servicing-lib/dist

WORKDIR /home/rafiki/test/integration

# TODO: remove sleep in favor of proper health check
CMD ["sh", "-c", "sleep 5 && npm test"]

# Run indefinitely.
# Start tests via docker exec to get test exit code
# CMD ["sleep", "infinity"]
