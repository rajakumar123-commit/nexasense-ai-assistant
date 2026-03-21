// ============================================================
// Upload Routes
// NexaSense AI Assistant v2.0
// POST /api/upload — protected
// ============================================================

const express    = require("express");
const router     = express.Router();
const upload     = require("../middleware/upload.middleware");
const uploadController  = require("../controllers/upload.controller");
const authMiddleware    = require("../middleware/auth.middleware");

// ─────────────────────────────────────────
// POST /api/upload
// 1. authMiddleware  — verify JWT
// 2. upload.single   — handle file
// 3. uploadFile      — process + queue
// ─────────────────────────────────────────
router.post("/", authMiddleware, upload.single("file"), uploadController.uploadFile);

module.exports = router;