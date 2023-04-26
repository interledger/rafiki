FROM node:18.13.0-slim as base
WORKDIR /workspace
RUN corepack enable
RUN corepack prepare pnpm@7.25.1 --activate
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN pnpm install --recursive --frozen-lockfile
CMD ["true"]