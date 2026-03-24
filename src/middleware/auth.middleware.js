'use strict';

// ============================================================
// auth.middleware.js — NexaSense AI Assistant
// Verifies JWT and attaches full user payload to req.user.
// role_id is required downstream by permissionMiddleware.
// ============================================================

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'Access denied. Token missing.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach full payload — role_id is essential for permissionMiddleware
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      role_id: decoded.role_id,
    };

    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ success: false, error: 'Token expired. Please login again.' });
    if (err.name === 'JsonWebTokenError')
      return res.status(401).json({ success: false, error: 'Invalid token.' });

    logger.error('[Auth] Middleware error:', err.message);
    return res.status(500).json({ success: false, error: 'Authentication error.' });
  }
}

module.exports = authMiddleware;