'use strict';

// ============================================================
// admin.controller.js — NexaSense AI Assistant
// ============================================================

const { pool } = require('../db');          // ← pool, not db.query
const logger   = require('../utils/logger');

// ── GET /api/admin/users ──────────────────────────────────────
async function getAllUsers(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.is_active,
        u.created_at,
        COUNT(c.id)::int AS total_questions  -- ::int prevents pg returning bigint as string
      FROM users u
      LEFT JOIN conversations c ON u.id = c.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    return res.status(200).json({ success: true, users: rows });

  } catch (err) {
    logger.error('[Admin] Error fetching users:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch users.' });
  }
}

// ── GET /api/admin/users/:id/questions ───────────────────────
async function getUserQuestions(req, res) {
  try {
    const { id } = req.params;

    const userResult = await pool.query(
      'SELECT email FROM users WHERE id = $1 LIMIT 1',
      [id]
    );
    if (!userResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const { rows } = await pool.query(`
      SELECT
        c.id,
        c.question,
        c.answer,
        c.created_at,
        d.file_name
      FROM conversations c
      LEFT JOIN documents d ON c.document_id = d.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `, [id]);

    return res.status(200).json({
      success:   true,
      email:     userResult.rows[0].email,
      questions: rows,
    });

  } catch (err) {
    logger.error('[Admin] Error fetching user questions:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch user questions.' });
  }
}

module.exports = { getAllUsers, getUserQuestions };