FROM node:18.13.0-slim as builder

RUN apt update
RUN apt install -y curl xz-utils python3 build-essential

WORKDIR /workspace

# version in curl is not the version used. Dependent on the last command
RUN corepack enable
RUN corepack prepare pnpm@7.25.1 --activate

CMD ["true"]