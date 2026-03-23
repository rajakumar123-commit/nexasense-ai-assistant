// ============================================================
// Auth Controller
// NexaSense AI Assistant
// Handles user signup and login
// ============================================================

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ─────────────────────────────────────────
// Helper — generate JWT token
// ─────────────────────────────────────────
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ─────────────────────────────────────────
// POST /api/auth/signup
// ─────────────────────────────────────────
async function signup(req, res) {
  try {
    const { email, password, full_name } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format.'
      });
    }

    // Check if email already exists
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered.'
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name, created_at`,
      [email.toLowerCase().trim(), password_hash, full_name || null]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    logger.info(`[Auth] New user registered: ${user.email}`);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        created_at: user.created_at
      }
    });

  } catch (err) {
    logger.error('[Auth] Signup error:', err.message, err.stack);
    return res.status(500).json({
      success: false,
      error: 'Signup failed. Please try again.'
    });
  }
}

// ─────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    // Find user by email
   const result = await db.query(
  `SELECT id, email, full_name, password_hash, is_active, created_at
   FROM users
   WHERE LOWER(email) = LOWER($1)`,
  [email.trim()]
);

    const user = result.rows[0];

    // Generic error — don't reveal if email exists
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    // Check account is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated. Contact support.'
      });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    const token = generateToken(user);

    logger.info(`[Auth] User logged in: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        created_at: user.created_at
      }
    });

  } catch (err) {
    logger.error('[Auth] Login error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
}

// ─────────────────────────────────────────
// GET /api/auth/me
// Returns current logged-in user profile
// ─────────────────────────────────────────
async function getMe(req, res) {
  try {
    const result = await db.query(
      `SELECT id, email, full_name, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0]
    });

  } catch (err) {
    logger.error('[Auth] GetMe error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile.'
    });
  }
}

module.exports = { signup, login, getMe };