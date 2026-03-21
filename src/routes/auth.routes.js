// ============================================================
// Auth Routes
// NexaSense AI Assistant
// POST /api/auth/signup
// POST /api/auth/login
// GET  /api/auth/me
// ============================================================

const express = require('express');
const router = express.Router();
const { signup, login, getMe } = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Public routes
router.post('/signup', signup);
router.post('/login', login);

// Protected route — requires valid JWT
router.get('/me', authMiddleware, getMe);

module.exports = router;