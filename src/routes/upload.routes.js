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
const requirePermission = require("../middleware/permissionMiddleware");

// ─────────────────────────────────────────
// POST /api/upload
// 1. authMiddleware       — verify JWT
// 2. requirePermission    — check RBAC
// 3. upload.single        — handle file
// 4. uploadFile           — process + queue
// ─────────────────────────────────────────
router.post(
  "/",
  authMiddleware,
  requirePermission("doc:upload"),
  upload.single("file"),
  uploadController.uploadFile
);

router.post(
  "/scrape",
  authMiddleware,
  requirePermission("doc:upload"),
  uploadController.scrapeUrl
);

module.exports = router;