// ============================================================
// Stream Routes
// NexaSense AI Assistant
// ============================================================

const express = require("express");
const router = express.Router();

const { streamQuery } = require("../controllers/queryStream.controller");

const authMiddleware     = require("../middleware/auth.middleware");
const requirePermission  = require("../middleware/permissionMiddleware");
const rateLimitMiddleware = require("../middleware/rateLimit.middleware");


// POST /api/query/stream
// ✅ FIX: Added requirePermission("chat:query") — matches protection on /api/query
router.post(
  "/query/stream",
  authMiddleware,
  requirePermission("chat:query"),
  rateLimitMiddleware,
  streamQuery
);

module.exports = router;