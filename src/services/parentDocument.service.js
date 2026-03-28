// ============================================================
// parentDocument.service.js — NexaSense AI V7.0 God Tier
//
// Parent-Document (Neighboring Chunk) Retrieval
//
// WHAT IT DOES:
//   After vector search returns chunk_index N, this service fetches
//   chunks at index [N-2, N-1, N, N+1, N+2] from PostgreSQL.
//
// WHY THIS MATTERS:
//   If the table "Semester VI → Subject List" is 3 chunks long:
//     chunk 10: "Semester VI"  ← heading (vector may NOT match this)
//     chunk 11: "CS601, CS602" ← data   (vector DOES match this)
//     chunk 12: "CS603, CS604" ← data
//
//   With only chunk 11, the LLM sees data but no context.
//   With parent retrieval, the LLM gets chunks 9–13 → full table.
//
// WINDOW SIZE:
//   Default ±2 (5 total chunks per hit). Kept small to avoid
//   polluting the context with completely unrelated sections.
// ============================================================

"use strict";

const db     = require("../db");
const logger = require("../utils/logger");

const DEFAULT_WINDOW = 2; // ±N chunks around each hit

/**
 * Given an array of retrieved chunks (from vector/keyword search),
 * fetch their neighboring chunks from PostgreSQL and merge them in.
 *
 * @param {Array}  chunks      - Retrieved chunks (each must have metadata.chunkIndex and metadata.documentId OR be tied to a single documentId param)
 * @param {string} documentId  - Primary document scope (used when metadata.documentId is absent)
 * @param {number} windowSize  - How many neighbors on each side (default: 2)
 * @returns {Array}            - Original chunks + neighbors, deduplicated, original order preserved
 */
async function expandWithParentChunks(chunks, documentId, windowSize = DEFAULT_WINDOW) {
  if (!chunks || chunks.length === 0) return chunks;

  try {
    // Group chunk indexes by documentId so we do ONE query per document
    const docIndexMap = new Map(); // docId → Set<chunkIndex>

    for (const chunk of chunks) {
      const docId = chunk?.metadata?.documentId || documentId;
      const idx   = chunk?.metadata?.chunkIndex;

      if (!docId || idx == null) continue;

      if (!docIndexMap.has(docId)) docIndexMap.set(docId, new Set());

      // Add the hit index AND its neighbors
      for (let offset = -windowSize; offset <= windowSize; offset++) {
        const neighborIdx = idx + offset;
        if (neighborIdx >= 0) docIndexMap.get(docId).add(neighborIdx);
      }
    }

    if (docIndexMap.size === 0) return chunks;

    // Fetch all neighbor chunks in parallel (one query per document)
    const neighborFetches = Array.from(docIndexMap.entries()).map(async ([docId, indexSet]) => {
      const indexes = Array.from(indexSet);

      const { rows } = await db.query(
        `SELECT
           id,
           content,
           chunk_index,
           role,
           metadata
         FROM chunks
         WHERE document_id = $1
           AND chunk_index = ANY($2::int[])
         ORDER BY chunk_index ASC`,
        [docId, indexes]
      );

      return rows.map(row => ({
        content:   row.content,
        metadata:  {
          ...(typeof row.metadata === "object" ? row.metadata : {}),
          chunkIndex  : row.chunk_index,
          documentId  : docId,
          chunkId     : row.id,
          isNeighbor  : true,   // Flag so pipeline telemetry can show this
        },
        role:       row.role || "GENERAL_CONTENT",
        similarity: 0.35,        // Assign baseline similarity — will be re-ranked
      }));
    });

    const neighborBatches = await Promise.all(neighborFetches);
    const neighborChunks  = neighborBatches.flat();

    // Merge: original hits first (they have real similarity scores),
    // then neighbors. Deduplication happens in the pipeline's dedupe() fn.
    const merged = [...chunks, ...neighborChunks];

    const addedCount = neighborChunks.length - chunks.length;
    logger.info(
      `[ParentDoc] Expanded ${chunks.length} hits → ${merged.length} chunks ` +
      `(+${Math.max(0, addedCount)} neighbors from ${docIndexMap.size} doc(s))`
    );

    return merged;

  } catch (err) {
    // Never block the pipeline — just log and return originals
    logger.warn("[ParentDoc] Neighbor fetch failed — using original chunks:", err.message);
    return chunks;
  }
}

module.exports = { expandWithParentChunks };
