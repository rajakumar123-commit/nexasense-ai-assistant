// ============================================================
// reranker.service.js
// NexaSense AI Assistant
// Semantic reranking of retrieved chunks
// FIX: Uses sharedEmbedder instead of its own duplicate model
// FIX: Replaced console.log with logger
// ============================================================

const { embedSingle } = require("./sharedEmbedder");
const logger          = require("../utils/logger");


// ------------------------------------------------------------
// Cosine similarity
// ------------------------------------------------------------

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}


// ------------------------------------------------------------
// Rerank chunks by semantic similarity to the query
// ------------------------------------------------------------

async function rerankChunks(query, chunks) {

  if (!chunks || chunks.length === 0) return [];

  try {

    const queryVector = await embedSingle(query);

    // Embed all chunks in parallel
    const chunkVectors = await Promise.all(
      chunks.map(chunk => embedSingle(chunk.content))
    );

    const scoredChunks = chunks.map((chunk, index) => ({
      ...chunk,
      rerankScore: cosineSimilarity(queryVector, chunkVectors[index])
    }));

    // Sort highest similarity first
    scoredChunks.sort((a, b) => b.rerankScore - a.rerankScore);

    return scoredChunks;

  } catch (err) {

    logger.warn("[Reranker] Failed, returning original order:", err.message);
    return chunks;

  }

}


module.exports = { rerankChunks };