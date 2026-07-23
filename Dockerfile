# Base images are pulled via Google's Docker Hub mirror (mirror.gcr.io) instead
# of docker.io directly. The GCP CI runners hit Docker Hub rate-limits / network
# timeouts on registry-1.docker.io; the mirror is a reliable pull-through cache.
FROM mirror.gcr.io/library/node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig*.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM mirror.gcr.io/library/node:20-alpine
RUN apk add --no-cache postgresql-client curl
RUN npm install -g pnpm

# Download and install Cloud SQL Proxy
# The proxy will be available at /cloud-sql-proxy
RUN curl -o /cloud-sql-proxy https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64 && \
    chmod +x /cloud-sql-proxy

WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Create app user
RUN mkdir -p /app/uploads /app/logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S express -u 1001 && \
    chown -R express:nodejs /app && \
    chmod +x /cloud-sql-proxy

USER express

# Create directories that the app needs
RUN mkdir -p /app/uploads /app/logs

EXPOSE 5000

# Default CMD runs the Node.js app directly
# When running in Cloud Run with Cloud SQL, the Cloud Run environment
# handles the Cloud SQL connection via the service account
CMD ["node", "dist/main.js"]
