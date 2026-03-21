// ============================================================
// keywordSearch.service.js
// NexaSense AI Assistant
// PostgreSQL Full-Text Search with ILIKE fallback
// ============================================================

const { pool } = require("../db");
const logger   = require("../utils/logger");

async function keywordSearch(documentId, query, limit = 5) {

  if (!documentId || !query) return [];

  try {

    // Primary: PostgreSQL full-text search (ranked, fast)
    const ftsQuery = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter(w => w.length > 1)
      .join(" & ");

    if (ftsQuery) {

      const { rows: ftsRows } = await pool.query(
        `SELECT
           content,
           chunk_index,
           ts_rank(search_vector, to_tsquery('english', $2)) AS rank
         FROM chunks
         WHERE document_id = $1
           AND search_vector @@ to_tsquery('english', $2)
         ORDER BY rank DESC
         LIMIT $3`,
        [documentId, ftsQuery, limit]
      );

      if (ftsRows.length > 0) {
        return ftsRows.map(row => ({
          content: row.content,
          metadata: { chunkIndex: row.chunk_index },
          similarity: Math.min(0.9, 0.5 + Number(row.rank) * 0.1)
        }));
      }

    }

    // Fallback: ILIKE for partial matches
    const { rows } = await pool.query(
      `SELECT content, chunk_index
       FROM chunks
       WHERE document_id = $1
         AND content ILIKE $2
       ORDER BY chunk_index
       LIMIT $3`,
      [documentId, `%${query}%`, limit]
    );

    return rows.map(row => ({
      content: row.content,
      metadata: { chunkIndex: row.chunk_index },
      similarity: 0.4
    }));

  } catch (error) {

    logger.error("[KeywordSearch] failed:", error.message);
    return [];

  }

}

module.exports = { keywordSearch };