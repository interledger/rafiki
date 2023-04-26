FROM base AS build
WORKDIR /workspace
RUN pnpm --filter backend build

FROM build as assets
WORKDIR /workspace
RUN rm -rf node_modules && pnpm recursive exec -- rm -rf ./src ./node_modules

FROM base as prod
WORKDIR /workspace
RUN --mount=type=cache,id=pnpm-store,target=/root/.pnpm-store\
  pnpm install --filter "backend..."\
  --frozen-lockfile\
  --unsafe-perm\
  --prod\
  | grep -v "cross-device link not permitted\|Falling back to copying packages from store"
COPY --from=assets /workspace .
CMD ["node", "./packages/backend/dist/index.js"]