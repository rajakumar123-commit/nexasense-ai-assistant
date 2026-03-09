const express = require("express");

const {
  listDocuments,
  deleteDocument,
  getDocumentChunks
} = require("../controllers/document.controller");

const router = express.Router();

router.get("/documents", listDocuments);
router.get("/documents/:id/chunks", getDocumentChunks);
router.delete("/documents/:id", deleteDocument);

module.exports = router;