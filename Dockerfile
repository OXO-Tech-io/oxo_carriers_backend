FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig*.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/uploads && \
    addgroup -g 1001 -S nodejs && \
    adduser -S express -u 1001 && \
    chown -R express:nodejs /app
USER express
EXPOSE 5000
CMD ["node", "dist/app.js"]
