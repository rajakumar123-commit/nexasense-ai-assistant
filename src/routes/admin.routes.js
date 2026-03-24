// ============================================================
// Admin Routes
// NexaSense AI Assistant
// ============================================================

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middleware/auth.middleware');
const requirePermission = require('../middleware/permissionMiddleware');

// Apply auth and admin checks to ALL routes in this file
router.use(authMiddleware);
router.use(requirePermission('admin:access'));

// Routes
router.get('/users', adminController.getAllUsers);
router.get('/users/:id/questions', adminController.getUserQuestions);

module.exports = router;
