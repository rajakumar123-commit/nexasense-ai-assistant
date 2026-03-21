# ============================================================
# Dockerfile
# NexaSense AI Assistant
# Production-hardened Node.js container
# ============================================================

FROM node:20-bookworm-slim

ENV NODE_OPTIONS="--experimental-wasm-threads --experimental-wasm-simd"

WORKDIR /app

# Install dumb-init for proper signal handling
# (prevents zombie processes, ensures graceful shutdown)
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/*

# Copy package files first (layer cache — only reinstalls
# when package.json changes, not on every code change)
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# Copy source
COPY . .

# Create required directories with correct permissions
# uploads: incoming files before processing
# logs:    persistent application logs
RUN mkdir -p /app/uploads /app/logs \
  && groupadd -r nexasense \
  && useradd -r -g nexasense nexasense \
  && chown -R nexasense:nexasense /app

# Drop to non-root user (security)
USER nexasense

EXPOSE 3000

# dumb-init as PID 1 — forwards signals correctly to Node
# so SIGTERM triggers graceful shutdown instead of SIGKILL
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "src/server.js"]