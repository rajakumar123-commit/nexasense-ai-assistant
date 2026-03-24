// ============================================================
// Dashboard Controller
// NexaSense AI Assistant
// Provides analytics + user credits
// ============================================================

const db = require('../db');
const logger = require('../utils/logger');

// ─────────────────────────────────────────
// GET /api/dashboard/stats
// Returns overall usage statistics + credits
// ─────────────────────────────────────────
async function getDashboardStats(req, res) {
  try {
    const userId = req.user.id;

    // ── Documents count
    const docsResult = await db.query(
      `SELECT COUNT(*)::int AS total_documents
       FROM documents
       WHERE user_id = $1`,
      [userId]
    );

    // ── Chunks count
    const chunksResult = await db.query(
      `SELECT COALESCE(SUM(chunk_count),0)::int AS total_chunks
       FROM documents
       WHERE user_id = $1`,
      [userId]
    );

    // ── Query stats
    const queryStats = await db.query(
      `SELECT
          COUNT(*)::int AS total_queries,
          COALESCE(AVG(total_ms),0)::int AS avg_response_ms
       FROM query_metrics
       WHERE user_id = $1`,
      [userId]
    );

    // ── Cache stats
    const cacheStats = await db.query(
      `SELECT COUNT(*)::int AS cached_queries
       FROM query_metrics
       WHERE user_id = $1 AND from_cache = true`,
      [userId]
    );

    // ── Recent queries
    const recentQueriesResult = await db.query(
      `SELECT question, total_ms, from_cache, created_at
       FROM query_metrics
       WHERE user_id = $1 AND question IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    // ── 🔥 ADD THIS (CREDITS FIX)
    const creditsResult = await db.query(
      `SELECT credits FROM users WHERE id = $1`,
      [userId]
    );

    const credits = creditsResult.rows[0]?.credits || 0;

    // ── FINAL RESPONSE
    res.json({
      success: true,
      data: {
        documents: docsResult.rows[0].total_documents,
        chunks: chunksResult.rows[0].total_chunks,
        queries: queryStats.rows[0].total_queries,
        avgResponseMs: queryStats.rows[0].avg_response_ms,
        cachedQueries: cacheStats.rows[0].cached_queries,
        recentQueries: recentQueriesResult.rows,
        credits // ✅ FIXED
      }
    });

  } catch (error) {
    logger.error("[Dashboard] Stats error:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard statistics"
    });
  }
}


// ─────────────────────────────────────────
// GET /api/dashboard/documents
// ─────────────────────────────────────────
async function getDocumentAnalytics(req, res) {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT
          id,
          file_name,
          status,
          chunk_count
       FROM documents
       WHERE user_id = $1
       ORDER BY id DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error("[Dashboard] Document analytics error:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch document analytics"
    });
  }
}


// ─────────────────────────────────────────
// GET /api/dashboard/queries
// ─────────────────────────────────────────
async function getQueryMetrics(req, res) {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT
          total_ms,
          from_cache
       FROM query_metrics
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error("[Dashboard] Query metrics error:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch query metrics"
    });
  }
}


// ─────────────────────────────────────────

module.exports = {
  getDashboardStats,
  getDocumentAnalytics,
  getQueryMetrics
};