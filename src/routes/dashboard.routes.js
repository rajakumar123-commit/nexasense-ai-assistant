// ============================================================
// Dashboard Routes
// NexaSense AI Assistant
// Provides analytics endpoints for the dashboard
// ============================================================

const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const dashboardController = require("../controllers/dashboard.controller");


// ─────────────────────────────────────────
// GET /api/dashboard/stats
// Returns overall dashboard statistics
// ─────────────────────────────────────────
router.get(
  "/stats",
  authMiddleware,
  dashboardController.getDashboardStats
);


// ─────────────────────────────────────────
// GET /api/dashboard/documents
// Returns document analytics
// ─────────────────────────────────────────
router.get(
  "/documents",
  authMiddleware,
  dashboardController.getDocumentAnalytics
);


// ─────────────────────────────────────────
// GET /api/dashboard/queries
// Returns query performance metrics
// ─────────────────────────────────────────
router.get(
  "/queries",
  authMiddleware,
  dashboardController.getQueryMetrics
);


// ─────────────────────────────────────────

module.exports = router;