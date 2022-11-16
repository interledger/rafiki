FROM node:16.17.1-slim as builder

WORKDIR /workspace

RUN apt update
RUN apt install -y curl xz-utils python3 build-essential

# version in curl is not the version used. Dependent on the last command
RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm@7.9.3

# pnpm fetch does require only lockfile
COPY pnpm-lock.yaml ./
RUN pnpm fetch

ADD . ./
RUN pnpm install -r --offline

RUN pnpm --filter backend build

CMD ["node", "./packages/backend/dist/index.js"]
