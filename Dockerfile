# ZynBill / Corezyn Cloud Ecosystem Server Dockerfile
FROM node:22-bookworm-slim

# Install system dependencies (curl for healthchecks, ca-certificates for SSL/TLS)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first for optimal Docker layer caching
COPY package*.json ./

# Install production dependencies (including WhatsApp Baileys, PostgreSQL pg, QRCode, Pino)
RUN npm install --omit=dev

# Copy application and server source files
COPY . .

# Ensure server data and public download directories exist with proper write permissions
RUN mkdir -p /app/server/data /app/server/public/downloads && chmod -R 755 /app/server/data /app/server/public/downloads

# Default Environment Variables
ENV PORT=4000
ENV NODE_ENV=production

EXPOSE 4000

# Container Healthcheck (Monitored by Coolify)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/api/v1/system/health || exit 1

# Start the cloud server
CMD ["node", "server/server.js"]
