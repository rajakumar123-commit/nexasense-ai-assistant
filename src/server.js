'use strict';

require('dotenv').config();

const app            = require('./app');
const { pool }       = require('./db');
const logger         = require('./utils/logger');
const { seedAdmin }  = require('./utils/seedAdmin');

const PORT = process.env.PORT || 3000;

// ── ONNX crash guards ─────────────────────────────────────────
// Only suppress KNOWN non-fatal ONNX log-flush messages.
// Using broad terms like "onnxruntime" or "blob:" hides real failures.
const NON_FATAL_PATTERNS = ['DefaultLogger'];
const isNonFatal = (msg = '') => NON_FATAL_PATTERNS.some(p => msg.includes(p));

process.on('uncaughtException', (err) => {
  if (isNonFatal(err?.message)) {
    logger.warn('[Server] Suppressed non-fatal background error:', err.message);
    return;
  }
  logger.error('[Server] Uncaught exception — exiting:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  if (isNonFatal(reason?.message || String(reason))) {
    logger.warn('[Server] Suppressed non-fatal unhandled rejection');
    return;
  }
  logger.error('[Server] Unhandled rejection:', reason);
});

// ── Bootstrap ─────────────────────────────────────────────────
async function startServer() {

  // 1. Verify DB connectivity — fatal if down
  try {
    await pool.query('SELECT NOW()');
    logger.info('✅ PostgreSQL connected and healthy');
  } catch (err) {
    logger.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }

  // 2. Seed RBAC roles, permissions, admin user, and back-fill role_id
  //    Non-blocking: seedAdmin catches its own errors internally.
  //    Server always reaches app.listen() regardless of seed outcome.
  await seedAdmin();

  // 3. Pre-warm embedding model — eliminates ONNX threading collision on first request
  try {
    const embed = require('./services/sharedEmbedder');
    logger.info('⏳ Pre-warming embedder...');
    await embed.embedSingle('warmup');
    logger.info('✅ Embedder warmed up.');
  } catch (err) {
    logger.warn('⚠️  Embedder warmup failed (non-fatal):', err.message);
  }

  // 4. Start HTTP server
  app.listen(PORT, () => {
    logger.info(`🚀 NexaSense running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  }).on('error', (err) => {
    logger.error('❌ Server bind failed:', err.message);
    process.exit(1);
  });
}

startServer();