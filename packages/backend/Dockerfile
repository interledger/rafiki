FROM node:14-slim as builder

WORKDIR /workspace

RUN apt update
RUN apt install -y curl xz-utils python3 build-essential
COPY package.json yarn.lock tsconfig.build.json .yarnrc.yml ./
COPY .yarn ./.yarn
COPY ./packages ./packages

RUN yarn install --immutable
RUN yarn workspaces foreach -ptvR --from backend run build \
  && yarn workspace backend build

CMD ["node", "./packages/backend/dist/index.js"]
