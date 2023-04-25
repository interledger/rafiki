FROM node:18.13.0-slim

WORKDIR /workspace

COPY --from=builder /workspace/node_modules ./packages/node_modules
COPY --from=builder /workspace/packages/auth ./packages/auth

CMD ["node", "./packages/auth/dist/index.js"]
