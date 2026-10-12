FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY pricing/src ./pricing/src
COPY web/src/practice.ts web/src/solana.ts web/src/tables.json ./web/src/
COPY server ./server
ENV NODE_ENV=production
USER node
CMD ["node","server/main.ts"]
