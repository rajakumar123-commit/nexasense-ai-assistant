// ============================================================
// Metrics Service
// NexaSense AI Assistant
// Handles query performance tracking
// ============================================================

const db = require('../db');
const logger = require('../utils/logger');


// ─────────────────────────────────────────
// Record query performance metrics
// ─────────────────────────────────────────
async function recordQueryMetrics({
  userId,
  documentId,
  totalMs,
  fromCache = false
}) {
  try {

    await db.query(
      `INSERT INTO query_metrics
       (user_id, document_id, total_ms, from_cache)
       VALUES ($1, $2, $3, $4)`,
      [userId, documentId || null, totalMs, fromCache]
    );

  } catch (error) {

    // Metrics failures should NOT break the main request
    logger.error("[Metrics] Failed to record query metrics:", error.message);

  }
}


// ─────────────────────────────────────────
// Get aggregated metrics for a user
// Used by dashboard
// ─────────────────────────────────────────
async function getUserMetrics(userId) {
  try {

    const result = await db.query(
      `SELECT
        COUNT(*)::int AS total_queries,
        COALESCE(AVG(total_ms),0)::int AS avg_latency,
        COUNT(*) FILTER (WHERE from_cache = true)::int AS cache_hits
       FROM query_metrics
       WHERE user_id = $1`,
      [userId]
    );

    return result.rows[0];

  } catch (error) {

    logger.error("[Metrics] Failed to fetch user metrics:", error.message);
    throw error;

  }
}


// ─────────────────────────────────────────
// Get recent query metrics
// Used for dashboard charts
// ─────────────────────────────────────────
async function getRecentMetrics(userId, limit = 50) {
  try {

    const result = await db.query(
      `SELECT
        total_ms,
        from_cache,
        document_id
       FROM query_metrics
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;

  } catch (error) {

    logger.error("[Metrics] Failed to fetch recent metrics:", error.message);
    throw error;

  }
}


// ─────────────────────────────────────────

module.exports = {
  recordQueryMetrics,
  getUserMetrics,
  getRecentMetrics
};