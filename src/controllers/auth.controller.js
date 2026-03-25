'use strict';

// ============================================================
// authController.js — NexaSense AI Assistant
// ============================================================

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');          // ← pool, not db.query
const logger = require('../utils/logger');
const { sendWelcomeEmail } = require('../utils/email.service');

const SALT_ROUNDS = 12;
const ACCESS_TTL = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// ── Role UUID cache ───────────────────────────────────────────
// Avoids a DB hit on every signup. Populated lazily after seedAdmin runs.
let _userRoleId = null;
async function getUserRoleId() {
  if (_userRoleId) return _userRoleId;
  const { rows } = await pool.query(`SELECT id FROM roles WHERE name = 'user' LIMIT 1`);
  if (!rows[0]) throw new Error("'user' role not found — has seedAdmin run?");
  _userRoleId = rows[0].id;
  return _userRoleId;
}

// ── Token generators ──────────────────────────────────────────
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,     // string  — for simple role checks (adminMiddleware)
      role_id: user.role_id,  // UUID    — for RBAC permission joins (permissionMiddleware)
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function generateRefreshToken(userId) {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

// ── POST /api/auth/signup ─────────────────────────────────────
async function signup(req, res) {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    if (password.length < 8)
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ success: false, error: 'Invalid email format.' });

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0)
      return res.status(409).json({ success: false, error: 'Email already registered.' });

    // role_id must be set so permissionMiddleware works from first login
    const userRoleId = await getUserRoleId();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const { rows } = await pool.query(
      `INSERT INTO users
         (email, password_hash, full_name, role, role_id, credits, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, 'user', $4, 100, true, NOW(), NOW())
       RETURNING id, email, full_name, role, role_id, credits, created_at`,
      [normalizedEmail, passwordHash, full_name || null, userRoleId]
    );
    const user = rows[0];

    logger.info(`[Auth] New user registered: ${user.email}`);

    // ✅ Fire-and-forget welcome email (non-blocking)
    sendWelcomeEmail(user.email, user.full_name);

    const refreshToken = generateRefreshToken(user.id);

    // Persist refresh token so sessions can be revoked
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      accessToken: generateAccessToken(user),
      refreshToken,
      user: {
        id: user.id, email: user.email,
        full_name: user.full_name, role: user.role, created_at: user.created_at,
      },
    });

  } catch (err) {
    logger.error('[Auth] Signup error:', err.message);
    return res.status(500).json({ success: false, error: 'Signup failed. Please try again.' });
  }
}

// ── POST /api/auth/login ──────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, error: 'Email and password are required.' });

    const { rows } = await pool.query(
      `SELECT id, email, full_name, role, role_id, password_hash, is_active, created_at
       FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email.trim()]
    );
    const user = rows[0];

    // Identical error for missing user and wrong password — prevents enumeration
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    if (!user.is_active)
      return res.status(403).json({ success: false, error: 'Account is deactivated. Contact support.' });

    logger.info(`[Auth] User logged in: ${user.email}`);

    const refreshToken = generateRefreshToken(user.id);

    // Persist refresh token so sessions can be revoked
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      accessToken: generateAccessToken(user),
      refreshToken,
      user: {
        id: user.id, email: user.email,
        full_name: user.full_name, role: user.role, created_at: user.created_at,
      },
    });

  } catch (err) {
    logger.error('[Auth] Login error:', err.message);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
}

// ── POST /api/auth/refresh ────────────────────────────────────
async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ success: false, error: 'Refresh token required.' });

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const { rows } = await pool.query(
      `SELECT id, email, full_name, role, role_id, is_active FROM users WHERE id = $1 LIMIT 1`,
      [payload.id]
    );
    const user = rows[0];
    if (!user || !user.is_active)
      return res.status(401).json({ success: false, error: 'User not found or deactivated.' });

    return res.status(200).json({
      success: true,
      accessToken: generateAccessToken(user),
    });

  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired refresh token.' });
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────
async function getMe(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, role, created_at FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (!rows[0])
      return res.status(404).json({ success: false, error: 'User not found.' });

    return res.status(200).json({ success: true, user: rows[0] });

  } catch (err) {
    logger.error('[Auth] GetMe error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch user profile.' });
  }
}

module.exports = { signup, login, refresh, getMe };