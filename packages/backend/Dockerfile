FROM node:18.13.0-slim as base
WORKDIR /workspace
RUN corepack enable
RUN corepack prepare pnpm@7.25.1 --activate
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN pnpm install --recursive --frozen-lockfile

FROM base AS build
WORKDIR /workspace
RUN pnpm --filter backend build

FROM build AS assets
WORKDIR /workspace
RUN rm -rf node_modules && pnpm recursive exec -- rm -rf ./src ./node_modules

FROM base AS prod
WORKDIR /workspace
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store\
  pnpm install --filter "backend..."\
  --frozen-lockfile\
  --unsafe-perm\
  --prod\
  | grep -v "cross-device link not permitted\|Falling back to copying packages from store"
COPY --from=assets /workspace .
CMD ["node", "./packages/backend/dist/index.js"]