# ============================================================
# Dockerfile
# NexaSense AI Assistant
# Backend + Worker container
# ============================================================

FROM node:20-bookworm-slim

# ── Puppeteer ke liye ENVIRONMENT VARIABLES ────────────────
# System Chromium use karo — npm wala download skip karo
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ── System dependencies ────────────────────────────────────
# dumb-init + curl pehle se tha — Chromium dependencies add kiye
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  dumb-init \
  curl \
  ca-certificates \
  chromium \
  fonts-liberation \
  fonts-ipafont-gothic \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# Copy package files first (layer cache optimisation)
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# ✅ Cache Buster: Force re-copy on code changes without breaking npm install cache
# Update this string to force a rebuild of the Node backend/worker
ARG CACHEBUST=v3.2_puppeteer_added

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