FROM node:14-slim as builder

WORKDIR /workspace

RUN apt update
RUN apt install -y curl xz-utils python3 build-essential
COPY package.json yarn.lock tsconfig.build.json .yarnrc.yml ./
COPY .yarn ./.yarn
COPY ./packages ./packages

RUN yarn install --immutable
RUN yarn workspaces foreach -ptvR --from rates run build \
  && yarn workspace rates build

CMD ["node", "./packages/rates/dist/server/index.js"]
