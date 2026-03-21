// ============================================================
// db/index.js
// NexaSense AI Assistant
// PostgreSQL connection pool
// ============================================================

const { Pool }  = require("pg");
const logger    = require("../utils/logger");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 60000,       // 60s — survive long embedding jobs
  connectionTimeoutMillis: 30000  // 30s — WASM embedding can be slow
});

// Test connection on startup — warn instead of crash if DB not yet ready
pool.connect((err, client, release) => {
  if (err) {
    logger.error("Database connection failed:", err.message);
    return;
  }
  logger.info("✅ PostgreSQL connected");
  release();
});

pool.on("error", (err) => {
  logger.error("PostgreSQL pool error:", err.message);
});

// ─────────────────────────────────────────
// Export query function directly
// Usage: const db = require('../db');
//        db.query('SELECT ...', [params])
// ─────────────────────────────────────────
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};