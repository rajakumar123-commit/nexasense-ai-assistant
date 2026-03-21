// ============================================================
// documentSummary.service.js
// NexaSense AI Assistant
// Generates document summary using existing chunks
// ============================================================

const db = require("../db");
const logger = require("../utils/logger");
const { generateAnswer } = require("./llm.service");

const MAX_SUMMARY_CHUNKS = 12;


// ------------------------------------------------------------
// Load document chunks
// ------------------------------------------------------------

async function loadDocumentChunks(documentId) {

  try {

    const { rows } = await db.query(
      `SELECT chunk_index, page_number, content
       FROM chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC
       LIMIT $2`,
      [documentId, MAX_SUMMARY_CHUNKS]
    );

    if (!rows.length) return [];

    return rows.map(r => ({
      content: r.content,
      metadata: {
        pageNumber: r.page_number,
        chunkIndex: r.chunk_index
      }
    }));

  }

  catch (err) {

    logger.error("[Summary] Failed to load chunks:", err.message);
    return [];

  }

}


// ------------------------------------------------------------
// Generate document summary
// ------------------------------------------------------------

async function summarizeDocument(documentId) {

  try {

    const chunks = await loadDocumentChunks(documentId);

    if (!chunks.length) {

      return "This document does not contain enough information to generate a summary.";

    }

    const question =
      "Summarize the document and list the main topics discussed.";

    const summary =
      await generateAnswer(question, chunks, []);

    return summary;

  }

  catch (err) {

    logger.error("[Summary] Generation failed:", err.message);

    return "Unable to generate document summary.";

  }

}


module.exports = {
  summarizeDocument
};