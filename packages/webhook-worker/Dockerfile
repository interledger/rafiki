FROM node:20-alpine3.20

WORKDIR /home/rafiki

RUN corepack enable
RUN corepack prepare pnpm@8.7.4 --activate

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.json ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch \
    | grep -v "cross-device link not permitted\|Falling back to copying packages from store"

COPY . ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install \
    --recursive \
    --offline \
    --frozen-lockfile

RUN pnpm --filter webhook-worker build

CMD pnpm --filter webhook-worker start