// ============================================================
// Embedder Service
// NexaSense AI Assistant
// Production Optimized (Batch Embeddings + Bulk Insert)
// FIX: Uses sharedEmbedder to avoid loading the model twice
//      (once in embedder + once in vectorSearch)
// FIX: Removed unnecessary BEGIN/COMMIT transaction wrapping
//      read-only chunk lookups + ChromaDB writes
// ============================================================

const { embedTexts }  = require("./sharedEmbedder");
const db              = require("../db");
const chroma          = require("../config/chroma");
const logger          = require("../utils/logger");

const BATCH_SIZE = 8;   // Smaller batches for WASM stability


// ------------------------------------------------------------
// Get (or create) the Chroma collection for a document
// Collection naming convention: doc_<uuid_with_underscores>
// MUST match the name used by vectorSearch.service.js
// ------------------------------------------------------------

async function getCollection(documentId) {
  const name = `doc_${documentId.replace(/-/g, "_")}`;

  return chroma.getOrCreateCollection({
    name,
    metadata: { documentId }
  });
}


// ------------------------------------------------------------
// Embed and store document chunks
// Saves vectors to ChromaDB; chunk records already exist in PG
// ------------------------------------------------------------

async function embedAndStoreChunks(documentId, chunks) {

  if (!chunks || chunks.length === 0) {
    throw new Error("No chunks provided for embedding");
  }

  logger.info(`[Embedder] Processing ${chunks.length} chunks for ${documentId}`);

  const collection = await getCollection(documentId);

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

      const chunkIds = batch.map(c => indexToId[c.chunk_index]).filter(Boolean);

      if (chunkIds.length === 0) {
        logger.warn(`[Embedder] No chunk IDs found for batch ${batchIndex}. Skipping vector store.`);
        continue;
      }

      // ---------- Store Vectors in Chroma ----------
      await collection.add({
        ids:        chunkIds,
        embeddings: embeddings.slice(0, chunkIds.length),
        documents:  texts.slice(0, chunkIds.length),
        metadatas:  chunkIds.map((id, j) => ({
          documentId,
          chunkIndex: batch[j].chunk_index,
          chunkId:    id
        }))
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
// Delete vectors for document (called on document delete)
// ------------------------------------------------------------

async function deleteDocumentVectors(documentId) {

  const name = `doc_${documentId.replace(/-/g, "_")}`;

  try {

    await chroma.deleteCollection({ name });
    logger.info(`[Embedder] Deleted collection ${name}`);

  } catch (err) {

    logger.warn("[Embedder] Delete collection failed:", err.message);

  }

}


module.exports = {
  embedAndStoreChunks,
  getCollection,
  deleteDocumentVectors
};