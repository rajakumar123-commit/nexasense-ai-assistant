// ============================================================
// Embedder Service (Pure REST Implementation)
// NexaSense AI Assistant
// Completely bypasses Chroma NPM client
// ============================================================

const { embedTexts }  = require("./sharedEmbedder");
const db              = require("../db");
const chromaConfig    = require("../config/chroma");
const logger          = require("../utils/logger");

const BATCH_SIZE = 8;

// ─── helpers ────────────────────────────────────────────────

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

// ------------------------------------------------------------
// Get (or create) the Chroma collection for a document
// ------------------------------------------------------------

async function getOrCreateCollection(documentId) {
  const name = `doc_${documentId.replace(/-/g, "_")}`;

  try {
    // POST /api/v1/collections acts as getOrCreate if we pass get_or_create: true
    const data = await chromaFetch(chromaConfig.collectionsUrl(), {
      method: "POST",
      body: JSON.stringify({
        name,
        get_or_create: true,
        metadata: { documentId }
      })
    });
    
    if (!data.id) throw new Error("ChromaDB returned no ID for new collection");
    return data.id;
  } catch (err) {
    throw new Error(`Failed to create Chroma collection: ${err.message}`);
  }
}

// ------------------------------------------------------------
// Embed and store document chunks
// ------------------------------------------------------------

async function embedAndStoreChunks(documentId, chunks) {

  if (!chunks || chunks.length === 0) {
    throw new Error("No chunks provided for embedding");
  }

  logger.info(`[Embedder] Processing ${chunks.length} chunks for ${documentId}`);

  // 1. Get collection ID
  const collectionId = await getOrCreateCollection(documentId);
  const client = await db.pool.connect();

  try {

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {

      const batch      = chunks.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

      logger.info(`[Embedder] Batch ${batchIndex}/${totalBatches}`);

      const texts = batch.map(c => c.content);

      // ---------- Batch Embedding ----------
      const embeddings = await embedTexts(texts);

      // ---------- Fetch chunk IDs already inserted by worker ----------
      const chunkIndexes = batch.map(c => c.chunk_index);

      const { rows: chunkRows } = await client.query(
        `SELECT id, chunk_index FROM chunks
         WHERE document_id = $1
           AND chunk_index = ANY($2::int[])
         ORDER BY chunk_index`,
        [documentId, chunkIndexes]
      );

      // Build a map: chunk_index → id
      const indexToId = {};
      chunkRows.forEach(r => { indexToId[r.chunk_index] = r.id; });

      // ✅ FIX: Guarantee alignment between chunk IDs, contents, and embeddings.
      // Filtering arrays independently causes index shifting if a chunk ID is missing.
      const validItems = batch.map((c, idx) => ({
        chunk: c,
        embedding: embeddings[idx],
        id: indexToId[c.chunk_index]
      })).filter(x => x.id);

      if (validItems.length === 0) {
        logger.warn(`[Embedder] No chunk IDs found for batch ${batchIndex}. Skipping vector store.`);
        continue;
      }

      // ---------- Store Vectors in Chroma (Native REST) ----------
      const addUrl = `${chromaConfig.API}/collections/${encodeURIComponent(collectionId)}/add`;
      
      await chromaFetch(addUrl, {
        method: "POST",
        body: JSON.stringify({
          ids:        validItems.map(x => x.id),
          embeddings: validItems.map(x => x.embedding),
          documents:  validItems.map(x => x.chunk.content),
          metadatas:  validItems.map(x => ({
            documentId,
            chunkIndex: x.chunk.chunk_index,
            chunkId:    x.id
          }))
        })
      });

      logger.info(`[Embedder] Stored batch ${batchIndex}/${totalBatches} in ChromaDB`);

    }

    logger.info(`[Embedder] Completed embedding for ${documentId}`);

  } catch (error) {

    logger.error("[Embedder] Failed:", error.message);
    throw error;

  } finally {

    client.release();

  }

}

// ------------------------------------------------------------
// Delete vectors for document
// ------------------------------------------------------------

async function deleteDocumentVectors(documentId) {

  const name = `doc_${documentId.replace(/-/g, "_")}`;

  try {
    
    await chromaFetch(chromaConfig.collectionUrl(name), {
      method: "DELETE"
    });
    logger.info(`[Embedder] Deleted collection ${name}`);

  } catch (err) {

    // If it's a 404 it means it was already deleted, ignore it
    if (err.status !== 404) {
        logger.warn("[Embedder] Delete collection failed:", err.message);
    }

  }

}

module.exports = {
  embedAndStoreChunks,
  getOrCreateCollection,
  deleteDocumentVectors
};