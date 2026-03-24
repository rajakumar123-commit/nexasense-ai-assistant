// ============================================================
// Query Routes
// NexaSense AI Assistant v2.0
// ============================================================

const express = require("express");
const router = express.Router();

const { queryDocument } = require("../controllers/query.controller");

const authMiddleware = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permissionMiddleware");
const rateLimitMiddleware = require("../middleware/rateLimit.middleware");


// ------------------------------------------------------------
// POST /api/query
// ------------------------------------------------------------

router.post(
  "/query",
  authMiddleware,
  requirePermission("chat:query"),
  rateLimitMiddleware,
  queryDocument
);

module.exports = router;