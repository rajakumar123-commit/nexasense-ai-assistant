// ============================================================
// keywordSearch.service.js — NexaSense AI V8.0 Ultimate
// PostgreSQL Full-Text Search — 100% Document Coverage
//
// FUNCTIONS:
//   keywordSearch()          — primary FTS + ILIKE (existing)
//   wordLevelSearch()        — Pass 3: search each word separately (OR logic)
//   getAllDocumentChunks()   — small-doc complete retrieval guarantee
//   getDocumentChunkCount()  — check if doc is small enough to fetch all
// ============================================================

const { pool } = require("../db");
const logger = require("../utils/logger");

// English stop words — removed from word-level search to avoid noise
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "this", "that", "these",
  "those", "it", "its", "they", "them", "their", "what", "which", "who",
  "how", "when", "where", "why", "all", "any", "each", "every", "some",
  "such", "than", "then", "so", "yet", "if", "as", "about", "between",
]);

/**
 * Primary full-text keyword search over document chunks.
 *
 * @param {string|null} documentId  - Specific doc ID, or null for global
 * @param {string}      query       - Search query string
 * @param {number}      limit       - Max results to return
 * @param {string|null} userId      - Required when documentId is null (global mode)
 */
async function keywordSearch(documentId, query, limit = 5, userId = null) {

  if (!query || !query.trim()) return [];

  if (!documentId && !userId) {
    logger.warn("[KeywordSearch] documentId=null but no userId provided — skipping");
    return [];
  }

  try {

    // AND-logic FTS query (all words must be present)
    const ftsQuery = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
      .join(" & ");

    // ── SINGLE DOCUMENT MODE ─────────────────────────────────
    if (documentId) {

      if (ftsQuery) {
        const { rows: ftsRows } = await pool.query(
          `SELECT
             content,
             chunk_index,
             document_id,
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
            metadata: { chunkIndex: row.chunk_index, documentId: row.document_id },
            similarity: Math.min(0.9, 0.5 + Number(row.rank) * 0.1),
            keywordMatch: true, // ✅ Prevents reranker from destroying exact text match
          }));
        }
      }

      // ILIKE fallback
      const { rows } = await pool.query(
        `SELECT content, chunk_index, document_id
         FROM chunks
         WHERE document_id = $1
           AND content ILIKE $2
         ORDER BY chunk_index
         LIMIT $3`,
        [documentId, `%${query}%`, limit]
      );

      return rows.map(row => ({
        content: row.content,
        metadata: { chunkIndex: row.chunk_index, documentId: row.document_id },
        similarity: 0.4,
        keywordMatch: true,
      }));
    }

    // ── GLOBAL (ALL-DOCS) MODE ───────────────────────────────
    logger.debug(`[KeywordSearch] Global mode — userId:${userId}`);

    if (ftsQuery) {
      const { rows: ftsRows } = await pool.query(
        `SELECT
           c.content,
           c.chunk_index,
           c.document_id,
           ts_rank(c.search_vector, to_tsquery('english', $2)) AS rank
         FROM chunks c
         INNER JOIN documents d ON d.id = c.document_id
         WHERE d.user_id = $1
           AND d.status = 'ready'
           AND c.search_vector @@ to_tsquery('english', $2)
         ORDER BY rank DESC
         LIMIT $3`,
        [userId, ftsQuery, limit * 2]
      );

      if (ftsRows.length > 0) {
        return ftsRows.map(row => ({
          content: row.content,
          metadata: { chunkIndex: row.chunk_index, documentId: row.document_id },
          similarity: Math.min(0.9, 0.5 + Number(row.rank) * 0.1),
          keywordMatch: true,
        }));
      }
    }

    // ILIKE fallback for global mode
    const { rows } = await pool.query(
      `SELECT c.content, c.chunk_index, c.document_id
       FROM chunks c
       INNER JOIN documents d ON d.id = c.document_id
       WHERE d.user_id = $1
         AND d.status = 'ready'
         AND c.content ILIKE $2
       ORDER BY c.chunk_index
       LIMIT $3`,
      [userId, `%${query}%`, limit * 2]
    );

    return rows.map(row => ({
      content: row.content,
      metadata: { chunkIndex: row.chunk_index, documentId: row.document_id },
      similarity: 0.4,
      keywordMatch: true,
    }));

  } catch (error) {
    logger.error("[KeywordSearch] failed:", error.message);
    return [];
  }
}

/**
 * PASS 3 — Word-Level Sweep Search (OR logic per word via ILIKE)
 *
 * The primary FTS uses AND logic — all words must be present.
 * This function searches each meaningful word SEPARATELY and unions
 * the results. Catches cases where the document uses synonyms,
 * different phrasing, or only part of the query appears per chunk.
 *
 * Examples where this saves the answer:
 *   "termination clause employment" → doc has "termination" in one chunk,
 *   "employment" in another — FTS (AND) misses both, this catches both.
 *
 *   "types of machine learning algorithms" → doc has "supervised learning"
 *   (not the phrase "types of machine learning") — FTS misses it,
 *   ILIKE on "supervised" or "learning" finds it.
 *
 * @param {string|null} documentId  - Target doc, or null for global
 * @param {string}      query       - The query to decompose
 * @param {number}      limitPerWord - Max results per individual word
 * @param {string|null} userId      - For global mode
 */
async function wordLevelSearch(documentId, query, limitPerWord = 5, userId = null) {

  if (!query || !query.trim()) return [];
  if (!documentId && !userId) return [];

  try {

    // Extract meaningful content words (length >= 4, not stop words)
    const contentWords = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w));

    if (contentWords.length === 0) return [];

    logger.debug(`[KeywordSearch] Word-level sweep: ${contentWords.length} words: [${contentWords.join(", ")}]`);

    // Run ILIKE search for each content word in parallel
    const wordSearches = contentWords.map(async (word) => {
      try {
        if (documentId) {
          const { rows } = await pool.query(
            `SELECT content, chunk_index, document_id
             FROM chunks
             WHERE document_id = $1
               AND content ILIKE $2
             ORDER BY chunk_index
             LIMIT $3`,
            [documentId, `%${word}%`, limitPerWord]
          );
          return rows.map(row => ({
            content: row.content,
            metadata: { chunkIndex: row.chunk_index, documentId: row.document_id },
            similarity: 0.25,  // low baseline — these are broad matches
            wordHit: word,
          }));
        } else {
          const { rows } = await pool.query(
            `SELECT c.content, c.chunk_index, c.document_id
             FROM chunks c
             INNER JOIN documents d ON d.id = c.document_id
             WHERE d.user_id = $1
               AND d.status = 'ready'
               AND c.content ILIKE $2
             ORDER BY c.chunk_index
             LIMIT $3`,
            [userId, `%${word}%`, limitPerWord]
          );
          return rows.map(row => ({
            content: row.content,
            metadata: { chunkIndex: row.chunk_index, documentId: row.document_id },
            similarity: 0.25,
            wordHit: word,
            keywordMatch: true,
          }));
        }
      } catch {
        return [];
      }
    });

    const results = (await Promise.all(wordSearches)).flat();
    logger.info(`[KeywordSearch] Word-level sweep: ${results.length} raw hits for ${contentWords.length} words`);
    return results;

  } catch (error) {
    logger.error("[KeywordSearch] wordLevelSearch failed:", error.message);
    return [];
  }
}

/**
 * Get total chunk count for a document.
 * Used to decide whether to attempt complete retrieval.
 */
async function getDocumentChunkCount(documentId) {
  if (!documentId) return Infinity;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM chunks WHERE document_id = $1`,
      [documentId]
    );
    return parseInt(rows[0]?.cnt || "0", 10);
  } catch {
    return Infinity;
  }
}

/**
 * ULTIMATE GUARANTEE — Complete Document Retrieval
 *
 * For documents with few chunks (≤ SMALL_DOC_THRESHOLD), retrieve
 * EVERY chunk and send to the LLM. The LLM will find the answer
 * even if the query words don't match any chunk verbatim.
 *
 * This is the nuclear option — 100% recall for small documents.
 * The LLM acts as the final "did this doc contain the answer" filter.
 *
 * @param {string} documentId
 * @param {number} limit — safety cap (default 60)
 */
async function getAllDocumentChunks(documentId, limit = 60) {
  if (!documentId) return [];
  try {
    const { rows } = await pool.query(
      `SELECT content, chunk_index, document_id, role, metadata
       FROM chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC
       LIMIT $2`,
      [documentId, limit]
    );

    return rows.map(row => ({
      content: row.content,
      metadata: {
        ...(typeof row.metadata === "object" ? row.metadata : {}),
        chunkIndex: row.chunk_index,
        documentId: row.document_id,
        completeDoc: true,    // flag so telemetry can show this
      },
      role: row.role || "GENERAL_CONTENT",
      similarity: 0.5,        // neutral similarity — reranker will score properly
    }));
  } catch (err) {
    logger.error("[KeywordSearch] getAllDocumentChunks failed:", err.message);
    return [];
  }
}

module.exports = {
  keywordSearch,
  wordLevelSearch,
  getDocumentChunkCount,
  getAllDocumentChunks,
};