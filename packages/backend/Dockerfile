FROM node:14-slim as builder

WORKDIR /workspace

RUN ulimit -l 65535

RUN apt update
RUN apt install -y build-essential
RUN apt install -y cmake
RUN apt install -y curl
RUN apt install -y iptables
RUN apt-get install python -y

COPY manifests ./

EXPOSE 3001/tcp

RUN yarn install --immutable --immutable-cache
COPY packs ./

CMD ["node", "-r", "./.pnp.cjs", "./packages/backend/dist/index.js"]
