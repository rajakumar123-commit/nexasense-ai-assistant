'use strict';

// ============================================================
// permissionMiddleware.js — NexaSense AI Assistant
// Fine-grained RBAC permission check via role_permissions table.
// Must be placed AFTER authMiddleware — req.user.role_id must exist.
// ============================================================

const { pool } = require('../db');
const logger   = require('../utils/logger');

/**
 * requirePermission(permissionName)
 * Factory that returns an Express middleware checking a named permission.
 * Both lookup indexes are covered:
 *   - role_permissions PRIMARY KEY covers role_id lookup ($1)
 *   - permissions UNIQUE constraint covers name lookup ($2)
 */
function requirePermission(permissionName) {
  return async function permissionMiddleware(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized.' });
      }

      // role_id absent = user was created before RBAC migration or token is stale.
      // seedAdmin's back-fill step (step 5) handles existing users automatically on restart.
      // For currently-logged-in users with stale tokens, asking them to re-login fixes it.
      if (!req.user.role_id) {
        logger.warn(`[Permission] No role_id for ${req.user.email} — stale token or pre-RBAC user.`);
        return res.status(403).json({
          success: false,
          error: 'Session outdated. Please log out and log back in.',
        });
      }

      const { rows } = await pool.query(
        `SELECT 1
         FROM role_permissions rp
         JOIN permissions p ON rp.permission_id = p.id
         WHERE rp.role_id = $1
           AND p.name     = $2
         LIMIT 1`,
        [req.user.role_id, permissionName]
      );

      if (rows.length === 0) {
        logger.warn(`[Permission] Denied: user=${req.user.email} permission=${permissionName}`);
        return res.status(403).json({
          success: false,
          error: `Forbidden. You do not have the '${permissionName}' permission.`,
        });
      }

      next();

    } catch (err) {
      // DB failure must not silently pass — deny and log
      logger.error('[Permission] DB error during permission check:', err.message);
      return res.status(500).json({
        success: false,
        error: 'Permission check failed. Please try again.',
      });
    }
  };
}

module.exports = requirePermission;