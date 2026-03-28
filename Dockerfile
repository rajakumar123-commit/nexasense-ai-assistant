# ============================================================
# Dockerfile
# NexaSense AI Assistant — V6.0 Multi-Modal
# Backend + Worker container
# ============================================================

FROM node:20-bookworm-slim

# ── Environment Variables ──────────────────────────────────
# 1. Puppeteer: Use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 2. Transformers: Force local cache path so build-time download is used at runtime
ENV XENOVA_TRANSFORMERS_CACHE=/app/.model-cache
ENV TRANSFORMERS_CACHE=/app/.model-cache

WORKDIR /app

# ── System Dependencies ────────────────────────────────────
# Necessary for Puppeteer (Chromium) and PDF processing
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  dumb-init \
  curl \
  ca-certificates \
  chromium \
  fonts-liberation \
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

# Copy package files for layer caching
COPY package*.json ./

# Install dependencies (Including new Gemini SDK)
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# ✅ Cache Buster: Updated to V6.0 for OCR and Scraper logic
ARG CACHEBUST=v6.0_ocr_scraper_final

# Copy application source
COPY . .

# ── Model Pre-caching & Permissions ────────────────────────
# 1. Create necessary directories
# 2. Pre-download the embedding model so it's BAKED into the image
# 3. Setup user (but stay as root for Volume compatibility)
RUN mkdir -p /app/uploads /app/logs /app/.model-cache \
  && node -e " \
  const { pipeline, env } = require('@xenova/transformers'); \
  env.cacheDir = '/app/.model-cache'; \
  pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true }) \
  .then(() => { console.log('✅ Model pre-cached successfully'); process.exit(0); }) \
  .catch(e => { console.error('❌ Model cache failed:', e); process.exit(1); }); \
  " \
  && groupadd -r nexasense \
  && useradd -r -g nexasense nexasense \
  && chown -R nexasense:nexasense /app

# Note: USER is not switched to allow Multer to write to Docker Volumes freely.
# If you face permission issues on EC2, keep this commented out.
# USER nexasense

EXPOSE 3000

# Using dumb-init to handle Linux signals (SIGTERM) correctly
ENTRYPOINT ["dumb-init", "--"]

# Default command starts the API; Docker-compose overrides this for the worker
CMD ["node", "src/server.js"]