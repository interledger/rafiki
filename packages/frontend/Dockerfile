FROM builder

WORKDIR /workspace

# pnpm fetch does require only lockfile
COPY pnpm-lock.yaml ./
RUN pnpm fetch --prod

ADD . ./
RUN pnpm install -r --offline --prod

RUN pnpm --filter frontend build

CMD pnpm --filter frontend start
