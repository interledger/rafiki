FROM node:16-slim as builder

WORKDIR /workspace

RUN apt update
RUN apt install -y curl xz-utils python3 build-essential

# version in curl is not the version used. Dependent on the last command
RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm@latest-7 \

# Files required by pnpm install
COPY .npmrc package.json pnpm-lock.yaml .pnpmfile.cjs ./

RUN pnpm install --frozen-lockfile --prod

# Bundle app source
COPY ./packages ./packages
COPY ./mock-servers ./mock-servers

RUN pnpm -F backend build

CMD ["node", "./packages/backend/dist/index.js"]
