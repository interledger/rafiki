FROM node:14-slim as builder

WORKDIR /workspace

RUN apt update
RUN apt install -y curl

COPY manifests ./
COPY packs ./
RUN yarn install --immutable

RUN yarn workspace openapi build && yarn workspace backend build

CMD ["node", "-r", "./.pnp.cjs", "./packages/backend/dist/index.js"]
