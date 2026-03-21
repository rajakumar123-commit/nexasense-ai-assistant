// ============================================================
// Rate Limit Middleware
// NexaSense AI Assistant
// Limits each user to 100 queries per day
// ============================================================

const db = require('../db');
const logger = require('../utils/logger');

const DAILY_QUERY_LIMIT = parseInt(process.env.DAILY_QUERY_LIMIT) || 100;

// ─────────────────────────────────────────
// Per-user daily query rate limiter
// Uses PostgreSQL query_metrics table
// ─────────────────────────────────────────
async function rateLimitMiddleware(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. User not found in request.'
      });
    }

    // Count queries made by this user in last 24 hours
    const result = await db.query(
      `SELECT COUNT(*) AS count
       FROM query_metrics
       WHERE user_id = $1
       AND created_at > NOW() - INTERVAL '1 day'`,
      [userId]
    );

    const queryCount = parseInt(result.rows[0].count);

    // Set rate limit headers so frontend can display usage
    res.setHeader('X-RateLimit-Limit', DAILY_QUERY_LIMIT);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, DAILY_QUERY_LIMIT - queryCount));

    if (queryCount >= DAILY_QUERY_LIMIT) {
      logger.warn(`[RateLimit] User ${userId} exceeded daily limit (${queryCount}/${DAILY_QUERY_LIMIT})`);

      return res.status(429).json({
        success: false,
        error: `Daily query limit reached (${DAILY_QUERY_LIMIT} queries/day).`,
        queriesUsed: queryCount,
        limit: DAILY_QUERY_LIMIT,
        resetAt: 'Resets every 24 hours'
      });
    }

    // Attach usage info to request for logging
    req.queryUsage = {
      used: queryCount,
      limit: DAILY_QUERY_LIMIT,
      remaining: DAILY_QUERY_LIMIT - queryCount
    };

    next();

  } catch (err) {
    logger.error('[RateLimit] Middleware error:', err.message);
    // On DB error, allow request through — don't block users
    next();
  }
}

module.exports = rateLimitMiddleware;