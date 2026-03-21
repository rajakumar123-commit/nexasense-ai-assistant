// ============================================================
// Stream Routes
// NexaSense AI Assistant
// ============================================================

const express = require("express");
const router = express.Router();

const { streamQuery } = require("../controllers/queryStream.controller");

const authMiddleware = require("../middleware/auth.middleware");
const rateLimitMiddleware = require("../middleware/rateLimit.middleware");


// POST /api/query/stream
router.post(
  "/query/stream",
  authMiddleware,
  rateLimitMiddleware,
  streamQuery
);

module.exports = router;