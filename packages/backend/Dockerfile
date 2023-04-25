FROM builder

WORKDIR /workspace

# pnpm fetch does require only lockfile
COPY pnpm-lock.yaml ./
RUN pnpm fetch --prod

ADD . ./
RUN pnpm install -r --offline --prod

RUN pnpm --filter backend build

CMD ["node", "./packages/backend/dist/index.js"]
