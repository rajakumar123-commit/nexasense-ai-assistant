// ============================================================
// semanticCache.js
// NexaSense AI Assistant
// Semantic embedding cache — in-process similarity cache
// FIX: Uses sharedEmbedder instead of its own model instance
// FIX: Replaced console.log with logger
// ============================================================

const { embedSingle } = require("../services/sharedEmbedder");
const logger          = require("../utils/logger");

const SIM_THRESHOLD = 0.92;
const CACHE_LIMIT   = 300;

const semanticCache = [];


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
// Get semantic cached result
// ------------------------------------------------------------

async function getSemanticCache(question) {

  try {

    const embedding = await embedSingle(question);

    let bestScore = 0;
    let best      = null;

    for (const item of semanticCache) {
      const score = cosineSimilarity(embedding, item.embedding);
      if (score > bestScore) { bestScore = score; best = item; }
    }

    if (bestScore >= SIM_THRESHOLD) {
      logger.info(`[SemanticCache] HIT ${bestScore.toFixed(3)}`);
      return best.result;
    }

    return null;

  } catch (err) {

    logger.warn("[SemanticCache] getSemanticCache failed:", err.message);
    return null;

  }

}


// ------------------------------------------------------------
// Store result
// ------------------------------------------------------------

async function storeSemanticCache(question, result) {

  try {

    const embedding = await embedSingle(question);

    semanticCache.unshift({ question, embedding, result });

    if (semanticCache.length > CACHE_LIMIT) {
      semanticCache.pop();
    }

  } catch (err) {

    logger.warn("[SemanticCache] store failed:", err.message);

  }

}


module.exports = { getSemanticCache, storeSemanticCache };