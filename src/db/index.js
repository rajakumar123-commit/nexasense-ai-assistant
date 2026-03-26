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

// Test connection on startup and run critical migrations
pool.connect(async (err, client, release) => {
  if (err) {
    logger.error("Database connection failed:", err.message);
    return;
  }
  logger.info("✅ PostgreSQL connected");
  
  try {
    // Ensure uuid-ossp extension exists
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Ensure messages table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id  UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role             TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content          TEXT        NOT NULL,
        token_count      INTEGER     DEFAULT 0,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages(conversation_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(conversation_id, role);
    `);
    
    logger.info("✅ Database schema verified (messages table synced)");
  } catch (syncErr) {
    logger.error("Database sync failed:", syncErr.message);
  } finally {
    release();
  }
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