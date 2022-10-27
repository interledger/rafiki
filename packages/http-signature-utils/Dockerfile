FROM node:18-slim as builder

WORKDIR /workspace

RUN apt update
RUN apt install -y curl xz-utils python3 build-essential

# version in curl is not the version used. Dependent on the last command
RUN corepack enable
RUN corepack prepare pnpm@7.25.1 --activate

# pnpm fetch does require only lockfile
COPY pnpm-lock.yaml ./
RUN pnpm fetch

ADD . ./
RUN pnpm install -r --offline

RUN pnpm --filter http-signature-utils build

CMD ["node", "./packages/http-signature-utils/dist/app.js"]
