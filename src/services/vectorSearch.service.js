// ============================================================
// vectorSearch.service.js
// NexaSense AI Assistant
// Vector Search with ChromaDB + MMR diversification
// FIX: Uses sharedEmbedder — eliminates duplicate model instance
// FIX: Replaced console.log/warn/error with logger
// ============================================================

const { embedSingle }  = require("./sharedEmbedder");
const chroma           = require("../config/chroma");
const logger           = require("../utils/logger");


// ------------------------------------------------------------
// Cosine similarity
// ------------------------------------------------------------

function cosineSimilarity(a, b) {

  if (!a || !b || a.length !== b.length) return 0;

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
// MMR diversification
// ------------------------------------------------------------

function mmr(queryEmbedding, candidates, k = 5, lambda = 0.7) {

  const selected  = [];
  const remaining = candidates.filter(c => c.embedding);

  while (selected.length < k && remaining.length > 0) {

    let bestScore = -Infinity;
    let bestIndex = 0;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = cosineSimilarity(queryEmbedding, candidate.embedding);

      let diversity = 0;
      for (const s of selected) {
        const sim = cosineSimilarity(candidate.embedding, s.embedding);
        diversity = Math.max(diversity, sim);
      }

      const score = lambda * relevance - (1 - lambda) * diversity;
      if (score > bestScore) { bestScore = score; bestIndex = i; }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}


// ------------------------------------------------------------
// Vector search in a SINGLE document collection
// ------------------------------------------------------------

async function searchDocument(documentId, query, k = 5) {

  try {

    if (!documentId || !query) return [];

    // Collection name MUST match embedder.service.js
    const collectionName = `doc_${documentId.replace(/-/g, "_")}`;

    let collection;

    try {
      collection = await chroma.getCollection({ name: collectionName });
    } catch {
      logger.warn("[VectorSearch] Collection not found:", collectionName);
      return [];
    }

    const queryEmbedding = await embedSingle(query);

    if (!queryEmbedding.length) return [];

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults:        Math.min(15, k * 3),
      include:         ["documents", "metadatas", "embeddings", "distances"]
    });

    const docs       = results.documents?.[0]  || [];
    const metas      = results.metadatas?.[0]  || [];
    const embeddings = results.embeddings?.[0] || [];
    const distances  = results.distances?.[0]  || [];

    if (!docs.length) return [];

    const candidates = docs.map((doc, i) => ({
      content:   doc,
      metadata:  metas[i]      || {},
      embedding: embeddings[i] || null,
      similarity: distances[i] !== undefined ? 1 - distances[i] : 0
    }));

    const diversified = mmr(queryEmbedding, candidates, k);

    return diversified.map(c => ({
      content:    c.content,
      metadata:   c.metadata,
      similarity: Number(c.similarity?.toFixed(4) || 0)
    }));

  } catch (err) {

    logger.error("[VectorSearch] searchDocument error:", err.message);
    return [];

  }

}


// ------------------------------------------------------------
// Multi-document vector search (searches across ALL user docs)
// ------------------------------------------------------------

async function searchUserDocuments(userId, query, k = 5) {

  try {

    if (!userId || !query) return [];

    const db = require("../db");

    const { rows } = await db.query(
      `SELECT id FROM documents WHERE user_id = $1 AND status = 'ready'`,
      [userId]
    );

    if (!rows.length) return [];

    let results = [];

    for (const doc of rows) {
      const chunks = await searchDocument(doc.id, query, k);
      if (chunks && chunks.length) {
        results.push(...chunks.map(c => ({
          ...c,
          metadata: { ...(c.metadata || {}), documentId: doc.id }
        })));
      }
    }

    return results;

  } catch (err) {

    logger.error("[VectorSearch] searchUserDocuments error:", err.message);
    return [];

  }

}


module.exports = { searchDocument, searchUserDocuments };