// ============================================================
// Auth Routes
// NexaSense AI Assistant
// POST /api/auth/signup
// POST /api/auth/login
// GET  /api/auth/me
// ============================================================

const express = require('express');
const router = express.Router();
const { signup, login, refresh, getMe } = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh', refresh);

// Protected route — requires valid JWT
router.get('/me', authMiddleware, getMe);

module.exports = router;