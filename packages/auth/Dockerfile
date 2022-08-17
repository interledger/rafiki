FROM node:14-slim as builder

WORKDIR /workspace

RUN apt update
RUN apt install -y curl xz-utils python3 build-essential
COPY package.json yarn.lock tsconfig.build.json .yarnrc.yml ./
COPY .yarn ./.yarn
COPY ./packages ./packages

RUN yarn install --immutable \
  && yarn workspaces foreach -ptvR --from auth run build \
  && yarn workspace auth build

CMD ["node", "./packages/auth/dist/index.js"]
