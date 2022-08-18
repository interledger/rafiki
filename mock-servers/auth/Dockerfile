FROM node:14-slim as builder

WORKDIR /workspace

RUN apt update
RUN apt install -y curl xz-utils python3 build-essential
COPY package.json yarn.lock tsconfig.build.json .yarnrc.yml ./
COPY .yarn ./.yarn
COPY ./packages ./packages
COPY ./mock-servers ./mock-servers

RUN yarn install --immutable
RUN yarn workspaces foreach -ptvR --from mock-auth run build \
  && yarn workspace mock-auth build

CMD ["node", "./mock-servers/auth/dist/index.js"]
