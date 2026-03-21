// ============================================================
// Auth Middleware
// NexaSense AI Assistant
// Verifies JWT token on every protected route
// ============================================================

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// ─────────────────────────────────────────
// Main auth middleware
// ─────────────────────────────────────────
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Check header exists and has correct format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. Token missing.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request object
    req.user = {
      id: decoded.id,
      email: decoded.email
    };

    next();

  } catch (err) {

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please login again.'
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token.'
      });
    }

    logger.error('[Auth] Middleware error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Authentication error.'
    });
  }
}

module.exports = authMiddleware;