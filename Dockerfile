# ============================================================
# Dockerfile
# NexaSense AI Assistant
# Backend + Worker container
# ============================================================

FROM node:20-bookworm-slim

# Clear NODE_OPTIONS — experimental WASM flags are NOT allowed
# in NODE_OPTIONS (causes "not allowed in NODE_OPTIONS" error).
# The WASM runtime sets its own flags internally.
ENV NODE_OPTIONS=""

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy package files first (layer cache optimisation)
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# ✅ Cache Buster: Force re-copy on code changes without breaking npm install cache
# Update this string to force a rebuild of the Node backend/worker
ARG CACHEBUST=v3.1_force_rebuild

# Copy application source
COPY . .

# Pre-cache embedding model + set permissions in one layer
RUN mkdir -p /app/uploads /app/logs /app/.model-cache \
  && node -e " \
    const { pipeline } = require('@xenova/transformers'); \
    pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true }) \
      .then(() => { console.log('Model cached ok'); process.exit(0); }) \
      .catch(e => { console.error(e); process.exit(1); }); \
  " \
  && groupadd -r nexasense \
  && useradd -r -g nexasense nexasense \
  && chown -R nexasense:nexasense /app

# Dropping to non-root user disabled to allow Multer to write to Docker named volumes
# USER nexasense

EXPOSE 3000

# dumb-init as PID 1 — forwards signals correctly to Node
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "src/server.js"]