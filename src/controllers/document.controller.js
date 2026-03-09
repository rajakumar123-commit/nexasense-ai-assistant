const fs = require("fs");
const path = require("path");

const { pool } = require("../db");    // add destructuring
const { deleteDocumentVectors } = require("../services/embedder.service");


// ─────────────────────────────
// List all documents
// ─────────────────────────────
async function listDocuments(req, res) {
  try {

    const { rows } = await pool.query(
      `SELECT id, filename, status, created_at
       FROM documents
       ORDER BY created_at DESC`
    );

    res.json(rows);

  } catch (error) {

    console.error("[ListDocuments]", error.message);

    res.status(500).json({
      error: "Failed to fetch documents"
    });

  }
}


// ─────────────────────────────
// Get document chunks (debug)
// ─────────────────────────────
async function getDocumentChunks(req, res) {
  try {

    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT chunk_index, page_number, content
       FROM chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "No chunks found for this document"
      });
    }

    res.json(rows);

  } catch (error) {

    console.error("[GetChunks]", error.message);

    res.status(500).json({
      error: "Failed to fetch chunks"
    });

  }
}


// ─────────────────────────────
// Delete document
// ─────────────────────────────
async function deleteDocument(req, res) {
  try {

    const { id } = req.params;

    const { rows } = await pool.query(
      "SELECT filename FROM documents WHERE id=$1",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Document not found"
      });
    }

    const filename = rows[0].filename;

    // delete vectors from Chroma
    await deleteDocumentVectors(id);

    // delete database record
    await pool.query(
      "DELETE FROM documents WHERE id=$1",
      [id]
    );

    // delete file
    const filePath = path.join(__dirname, "../../uploads", filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      message: "Document deleted successfully"
    });

  } catch (error) {

    console.error("[DeleteDocument]", error.message);

    res.status(500).json({
      error: "Failed to delete document"
    });

  }
}


module.exports = {
  listDocuments,
  deleteDocument,
  getDocumentChunks
};