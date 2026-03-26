// ============================================================
// vectorSearch.service.js
// Pure HTTP Fetch implementation to interact with ChromaDB.
// Completely bypasses the C++ Segmentation fault bug!
// ============================================================
"use strict";

const { embedSingle }       = require("./sharedEmbedder");
const { collectionUrl, collectionQueryUrl } = require("../config/chroma");
const logger                = require("../utils/logger");
const { vectorSearchDuration } = require("./metrics.service");

// ─── helpers ────────────────────────────────────────────────

// name → UUID cache (avoids a round-trip on every query)
const _idCache = new Map();

async function chromaFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err  = new Error(`ChromaDB ${res.status} @ ${url}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function resolveCollectionId(name) {
  if (_idCache.has(name)) return _idCache.get(name);
  // GET /api/v1/collections/{name}  →  { id, name, ... }
  const data = await chromaFetch(collectionUrl(name));
  if (!data.id) throw new Error(`ChromaDB returned no id for collection "${name}"`);
  _idCache.set(name, data.id);
  return data.id;
}

// ─── cosine similarity ───────

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

// ─── MMR ─────────────────────

function mmr(queryEmbedding, candidates, k = 5, lambda = 0.7) {
  const selected  = [];
  const remaining = candidates.filter(c => c.embedding);

  while (selected.length < k && remaining.length > 0) {
    let bestScore = -Infinity, bestIndex = 0;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = cosineSimilarity(queryEmbedding, remaining[i].embedding);
      let diversity = 0;
      for (const s of selected) {
        diversity = Math.max(diversity, cosineSimilarity(remaining[i].embedding, s.embedding));
      }
      const score = lambda * relevance - (1 - lambda) * diversity;
      if (score > bestScore) { bestScore = score; bestIndex = i; }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}

// ─── searchDocument ──────────────────────────────────────────

async function searchDocument(documentId, query, k = 5) {
  try {
    if (!documentId || !query) return [];

    const collectionName = `doc_${documentId.replace(/-/g, "_")}`;

    // Resolve name → UUID; 404 means collection doesn't exist yet
    let collectionId;
    try {
      collectionId = await resolveCollectionId(collectionName);
    } catch (err) {
      if (err.status === 404) {
        logger.warn("[VectorSearch] Collection not found:", collectionName);
        return [];
      }
      throw err;
    }

    // embedSingle returns number[] wrapper
    const queryEmbedding = await embedSingle(query);
    if (!queryEmbedding || !queryEmbedding.length) return [];

    // pure fetch() — no chromadb package
    const raw = await chromaFetch(collectionQueryUrl(collectionId), {
      method: "POST",
      body: JSON.stringify({
        query_embeddings: [queryEmbedding], // ← outer array required by REST API
        n_results:        Math.min(15, k * 3),
        include:          ["documents", "metadatas", "embeddings", "distances"],
      }),
    });

    // ChromaDB REST returns columnar arrays
    const docs       = raw.documents?.[0]  || [];
    const metas      = raw.metadatas?.[0]  || [];
    const embeddings = raw.embeddings?.[0] || [];
    const distances  = raw.distances?.[0]  || [];

    if (!docs.length) return [];

    const candidates = docs.map((doc, i) => ({
      content:    doc,
      metadata:   metas[i]      || {},
      embedding:  embeddings[i] || null,
      similarity: distances[i]  !== undefined ? 1 - distances[i] : 0,
    }));

    const mmrStart = Date.now();
    const diversified = mmr(queryEmbedding, candidates, k);
    vectorSearchDuration.labels("chroma").observe((Date.now() - mmrStart) / 1000);

    return diversified.map(c => ({
      content:    c.content,
      metadata:   c.metadata,
      similarity: Number(c.similarity?.toFixed(4) || 0),
    }));

  } catch (err) {
    logger.error("[VectorSearch] searchDocument error:", err.message);
    return [];
  }
}

// ─── searchUserDocuments ─

async function searchUserDocuments(userId, query, k = 5) {
  try {
    if (!userId || !query) return [];

    const db = require("../db");
    const { rows } = await db.query(
      `SELECT id FROM documents WHERE user_id = $1 AND status = 'ready'`,
      [userId]
    );

    if (!rows.length) return [];

    // FIX: Parallelize vector lookups across all user documents for a massive speed boost
    const searchPromises = rows.map(async (doc) => {
      const chunks = await searchDocument(doc.id, query, k);
      if (chunks && chunks.length > 0) {
        return chunks.map(c => ({
          ...c,
          metadata: { ...(c.metadata || {}), documentId: doc.id },
        }));
      }
      return [];
    });

    const resultsArray = await Promise.all(searchPromises);
    return resultsArray.flat();

  } catch (err) {
    logger.error("[VectorSearch] searchUserDocuments error:", err.message);
    return [];
  }
}

module.exports = { searchDocument, searchUserDocuments };