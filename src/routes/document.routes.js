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


// ------------------------------------------------------------
// All document routes require JWT authentication
// ------------------------------------------------------------

router.use(authMiddleware);


// ------------------------------------------------------------
// Document management
// ------------------------------------------------------------

router.get("/documents", listDocuments);

router.get("/documents/:id/status", getDocumentStatus);

router.get("/documents/:id/chunks", getDocumentChunks);

router.delete("/documents/:id", deleteDocument);


// ------------------------------------------------------------
// AI document features
// ------------------------------------------------------------

router.post("/document/summary", documentSummary);

router.post("/document/suggestions", documentSuggestions);


module.exports = router;