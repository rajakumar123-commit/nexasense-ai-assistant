// ============================================================
// db/index.js
// NexaSense AI Assistant (Optimized for High-Concurrency RAG)
// PostgreSQL connection pool
// ============================================================

const { Pool }  = require("pg");
const logger    = require("../utils/logger");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  
  // 1. Dynamic Scaling: Default to 20, but allow ENV overrides for heavier instances
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 20,
  
  // 2. Aggressive Resource Cleanup: Kill idle connections faster to free up RAM
  idleTimeoutMillis: 10000,       // Dropped from 60s -> 10s
  
  // 3. Fail-Fast Connection: Don't let the queue hang indefinitely
  connectionTimeoutMillis: 15000, // Dropped from 30s -> 15s
  
  // 4. Query Failsafe: Prevent runaway vector searches from locking the DB
  query_timeout: 30000,           // Hard-kill any query taking longer than 30s
  
  // 5. Memory Leak Guard: Cycle connections to flush the prepared statement cache
  maxUses: 7500
});

// Test connection on startup and run critical migrations
pool.connect(async (err, client, release) => {
  if (err) {
    logger.error("Database connection failed:", err.message);
    return;
  }
  logger.info("✅ PostgreSQL connected (Optimized Pool)");
  
  try {
    // Ensure uuid-ossp extension exists
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Ensure messages table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
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
    release(); // Crucial: Always release the client back to the pool
  }
});

pool.on("error", (err) => {
  // Log unexpected errors on idle clients rather than crashing the Node process
  logger.error("PostgreSQL pool error (Idle client):", err.message);
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