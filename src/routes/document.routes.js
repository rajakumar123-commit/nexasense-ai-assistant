// ============================================================
// Document Routes
// NexaSense AI Assistant v2.1
// All routes protected with authMiddleware
// ============================================================

const express = require("express");
const router  = express.Router();

const {
  listDocuments,
  getDocumentStatus,
  getDocumentChunks,
  deleteDocument,
  documentSummary,
  documentSuggestions
} = require("../controllers/document.controller");

const authMiddleware = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permissionMiddleware");


// ------------------------------------------------------------
// All document routes require JWT authentication
// ------------------------------------------------------------

router.use(authMiddleware);


// ------------------------------------------------------------
// Document management
// ------------------------------------------------------------

router.get("/documents", requirePermission("chat:query"), listDocuments);

router.get("/documents/:id/status", requirePermission("chat:query"), getDocumentStatus);

router.get("/documents/:id/chunks", requirePermission("chat:query"), getDocumentChunks);

router.delete("/documents/:id", requirePermission("doc:delete"), deleteDocument);


// ------------------------------------------------------------
// AI document features
// ------------------------------------------------------------

router.post("/document/summary", requirePermission("chat:query"), documentSummary);

router.post("/document/suggestions", requirePermission("chat:query"), documentSuggestions);


module.exports = router;