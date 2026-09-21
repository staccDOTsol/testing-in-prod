FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

COPY server/package.json server/package.json
RUN npm install --omit=dev --prefix server

COPY server/src server/src
COPY --from=builder /app/web/dist web/dist

EXPOSE 8787
CMD ["node", "server/src/index.js"]
