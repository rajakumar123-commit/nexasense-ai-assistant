// ============================================================
// Document Controller
// NexaSense AI Assistant v2.1
// Added: document summary + question suggestions
// ============================================================

const fs     = require("fs");
const path   = require("path");
const db     = require("../db");
const logger = require("../utils/logger");

const { deleteDocumentVectors } = require("../services/embedder.service");

const { summarizeDocument }   = require("../services/documentSummary.service");
const { generateSuggestions } = require("../services/questionSuggestion.service");


// ─────────────────────────────────────────
// GET /api/documents
// List only current user's documents
// ─────────────────────────────────────────
async function listDocuments(req, res) {
  try {

    const userId = req.user.id;

    const { rows } = await db.query(
      `SELECT id, file_name, file_size, status, chunk_count, created_at
       FROM documents
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      documents: rows
    });

  } catch (error) {

    logger.error("[Documents] listDocuments error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch documents"
    });
  }
}


// ─────────────────────────────────────────
// GET /api/documents/:id/status
// Poll ingestion status
// ─────────────────────────────────────────
async function getDocumentStatus(req, res) {

  try {

    const { id } = req.params;
    const userId = req.user.id;

    const { rows } = await db.query(
      `SELECT id, file_name, status, chunk_count, error_msg, created_at
       FROM documents
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: "Document not found"
      });
    }

    const doc = rows[0];

    return res.status(200).json({
      success: true,
      documentId: doc.id,
      fileName: doc.file_name,
      status: doc.status,
      chunkCount: doc.chunk_count,
      errorMsg: doc.error_msg || null,
      createdAt: doc.created_at,
      ready: doc.status === "ready"
    });

  } catch (error) {

    logger.error("[Documents] status error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch document status"
    });
  }
}


// ─────────────────────────────────────────
// GET /api/documents/:id/chunks
// Debug chunk inspection
// ─────────────────────────────────────────
async function getDocumentChunks(req, res) {

  try {

    const { id } = req.params;
    const userId = req.user.id;

    const docCheck = await db.query(
      `SELECT id FROM documents
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!docCheck.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Document not found"
      });
    }

    const { rows } = await db.query(
      `SELECT chunk_index, page_number, content
       FROM chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: "No chunks found for this document"
      });
    }

    return res.status(200).json({
      success: true,
      count: rows.length,
      chunks: rows
    });

  } catch (error) {

    logger.error("[Documents] getDocumentChunks error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch chunks"
    });
  }
}


// ─────────────────────────────────────────
// POST /api/document/summary
// Generate document summary
// ─────────────────────────────────────────
async function documentSummary(req, res) {

  try {

    const { documentId } = req.body;
    const userId = req.user.id;

    const { rows } = await db.query(
      `SELECT id
       FROM documents
       WHERE id = $1 AND user_id = $2`,
      [documentId, userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: "Document not found"
      });
    }

    const summary = await summarizeDocument(documentId);

    return res.status(200).json({
      success: true,
      documentId,
      summary
    });

  } catch (error) {

    logger.error("[Documents] summary error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to generate summary"
    });
  }
}


// ─────────────────────────────────────────
// POST /api/document/suggestions
// Generate suggested questions
// ─────────────────────────────────────────
async function documentSuggestions(req, res) {

  try {

    const { documentId } = req.body;
    const userId = req.user.id;

    const { rows } = await db.query(
      `SELECT id
       FROM documents
       WHERE id = $1 AND user_id = $2`,
      [documentId, userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: "Document not found"
      });
    }

    const questions = await generateSuggestions(documentId);

    return res.status(200).json({
      success: true,
      documentId,
      questions
    });

  } catch (error) {

    logger.error("[Documents] suggestion error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to generate suggestions"
    });
  }
}


// ─────────────────────────────────────────
// DELETE /api/documents/:id
// Delete document + vectors + file
// ─────────────────────────────────────────
async function deleteDocument(req, res) {

  try {

    const { id } = req.params;
    const userId = req.user.id;

    const { rows } = await db.query(
      `SELECT id, file_name
       FROM documents
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: "Document not found"
      });
    }

    const fileName = rows[0].file_name;

    await deleteDocumentVectors(id).catch((err) => {
      logger.warn(`[Documents] Vector delete failed: ${id}`, err.message);
    });

    await db.query(
      `DELETE FROM documents WHERE id = $1`,
      [id]
    );

    const filePath = path.join(__dirname, "../../uploads", fileName);

    // ✅ FIX W3: Use async unlink — unlinkSync blocks the Node.js event loop
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch(e =>
        logger.warn(`[Documents] File unlink failed: ${e.message}`)
      );
    }

    logger.info(`[Documents] Deleted ${id} | user ${userId}`);

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully"
    });

  } catch (error) {

    logger.error("[Documents] deleteDocument error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to delete document"
    });
  }
}


module.exports = {
  listDocuments,
  getDocumentStatus,
  getDocumentChunks,
  deleteDocument,
  documentSummary,
  documentSuggestions
};