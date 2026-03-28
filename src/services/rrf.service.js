// ============================================================
// rrf.service.js — NexaSense AI V7.0 God Tier
//
// Reciprocal Rank Fusion (RRF) for Hybrid Search
//
// WHAT IT DOES:
//   Instead of merging vector + keyword results by raw similarity
//   scores (which lets a "loud but wrong" keyword hit dominate),
//   RRF scores each chunk by its RANK in each list.
//
//   Formula: score(chunk) = Σ  1 / (k + rank_in_list)
//   k = 60 is the industry-standard constant (Robertson et al.)
//
// WHY THIS MATTERS:
//   A chunk that ranks #1 in vector search AND #2 in keyword
//   search will outscore a chunk that's #1 in keyword only.
//   This is the gold standard for hybrid RAG retrieval.
// ============================================================

"use strict";

const logger = require("../utils/logger");

const RRF_K = 60; // Industry standard constant

/**
 * Apply Reciprocal Rank Fusion across multiple ranked result lists.
 *
 * @param  {...Array} rankedLists  - One or more arrays of chunks (each array
 *                                   must already be in ranked order, best first).
 *                                   Each chunk must have a `content` field.
 * @returns {Array}  Re-ranked chunks with a new `rrfScore` property, sorted
 *                   descending (best chunk first).
 */
function applyRRF(...rankedLists) {
  // Map: unique chunk key → { chunk, rrfScore }
  const scoreMap = new Map();

  for (const list of rankedLists) {
    if (!Array.isArray(list) || list.length === 0) continue;

    list.forEach((chunk, rank) => {
      // Build a stable key — prefer documentId+chunkIndex, fall back to content prefix
      const key =
        chunk?.metadata?.documentId && chunk?.metadata?.chunkIndex != null
          ? `${chunk.metadata.documentId}::${chunk.metadata.chunkIndex}`
          : (chunk?.content || "").slice(0, 120);

      if (!key) return;

      const contribution = 1 / (RRF_K + rank + 1); // rank is 0-indexed, so +1

      if (scoreMap.has(key)) {
        const entry = scoreMap.get(key);
        entry.rrfScore += contribution;
        // ✅ V8.2 FIX: If the keyword chunk gave this a hit, transfer the immunity shield!
        if (chunk.keywordMatch) {
          entry.chunk.keywordMatch = true;
        }
      } else {
        scoreMap.set(key, {
          chunk:    chunk,
          rrfScore: contribution,
        });
      }
    });
  }

  const results = Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(({ chunk, rrfScore }) => ({
      ...chunk,
      similarity: rrfScore,   // Overwrite similarity with RRF score for pipeline compat
      rrfScore,               // Also expose raw RRF score for telemetry/debugging
    }));

  logger.debug(
    `[RRF] Fused ${rankedLists.reduce((s, l) => s + (l?.length || 0), 0)} ` +
    `raw results → ${results.length} unique chunks | top score: ${results[0]?.rrfScore?.toFixed(4) ?? 0}`
  );

  return results;
}

module.exports = { applyRRF };
