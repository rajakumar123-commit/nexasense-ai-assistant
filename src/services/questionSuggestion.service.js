// ============================================================
// questionSuggestion.service.js
// NexaSense AI Assistant
// Generates suggested questions from document content
// ============================================================

const db = require("../db");
const logger = require("../utils/logger");
const { generateAnswer } = require("./llm.service");

const MAX_CHUNKS = 10;


// ------------------------------------------------------------
// Load document chunks
// ------------------------------------------------------------

async function loadChunks(documentId) {

  try {

    const { rows } = await db.query(
      `SELECT chunk_index, page_number, content
       FROM chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC
       LIMIT $2`,
      [documentId, MAX_CHUNKS]
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

    logger.error("[Suggestions] Failed loading chunks:", err.message);
    return [];

  }

}


// ------------------------------------------------------------
// Generate suggested questions
// ------------------------------------------------------------

async function generateSuggestions(documentId) {

  try {

    const chunks = await loadChunks(documentId);

    if (!chunks.length) return [];

    const question =
      "Generate 5 useful questions a user might ask about this document.";

    const answer =
      await generateAnswer(question, chunks, []);

    const questions =
      answer
        .split("\n")
        .map(q => q.replace(/^\d+\.?\s*/, "").trim())
        .filter(Boolean)
        .slice(0,5);

    return questions;

  }

  catch (err) {

    logger.error("[Suggestions] Generation failed:", err.message);
    return [];

  }

}


module.exports = {
  generateSuggestions
};