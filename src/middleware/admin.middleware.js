'use strict';

// ============================================================
// admin.middleware.js — NexaSense AI Assistant
// Live DB role check — catches role revocations within one request cycle.
// Must be placed AFTER authMiddleware in the chain.
// ============================================================

const { pool } = require('../db');          // ← pool, not db.query
const logger   = require('../utils/logger');

async function adminMiddleware(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Authentication required.' });
    }

    const { rows } = await pool.query(
      'SELECT role FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );

    if (!rows[0] || rows[0].role !== 'admin') {
      logger.warn(`[Admin] Access denied: ${req.user.email} (role: ${req.user.role})`);
      return res.status(403).json({ success: false, error: 'Forbidden. Admin access required.' });
    }

    next();

  } catch (err) {
    logger.error('[Admin] Middleware error:', err.message);
    return res.status(500).json({ success: false, error: 'Authorization error.' });
  }
}

module.exports = adminMiddleware;