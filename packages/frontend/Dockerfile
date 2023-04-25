FROM node:18.13.0-slim

WORKDIR /root/

COPY --from=builder /workspace/packages/frontend ./

CMD ["node", "build/index.js"]