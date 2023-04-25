FROM node:18.13.0-slim

WORKDIR /root/

COPY --from=builder /workspace/node_modules ./packages/node_modules
COPY --from=builder /workspace/packages/backend ./packages/backend

CMD ["node", "./packages/backend/dist/index.js"]