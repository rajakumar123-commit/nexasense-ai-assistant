const { pipeline } = require("@xenova/transformers");
const { pool } = require("../db");
const chroma = require("../config/chroma");

const EMBEDDING_DIMENSION = 384;
const BATCH_SIZE = 10;

let embedder = null;

// Load embedding model once
async function getEmbedder() {
  if (!embedder) {
    console.log("[Embedder] Loading embedding model...");
    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    console.log("[Embedder] Model loaded");
  }
  return embedder;
}

// Convert text → vector
async function embedText(text) {
  const model = await getEmbedder();

  const output = await model(text, {
    pooling: "mean",
    normalize: true
  });

  const embedding = Array.from(output.data);

  if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Invalid embedding: expected ${EMBEDDING_DIMENSION}, got ${embedding?.length}`
    );
  }

  return embedding;
}

// Get Chroma collection
async function getCollection(documentId) {
  const name = `doc_${documentId.replace(/-/g, "_")}`;

  return await chroma.getOrCreateCollection({
    name,
    metadata: { documentId },
    embeddingFunction: null
  });
}

// Embed chunks and store
async function embedAndStoreChunks(documentId, chunks) {

  console.log(`[Embedder] Embedding ${chunks.length} chunks`);

  const collection = await getCollection(documentId);
  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {

      const batch = chunks.slice(i, i + BATCH_SIZE);

      console.log(
        `[Embedder] Batch ${Math.floor(i / BATCH_SIZE) + 1}/` +
        `${Math.ceil(chunks.length / BATCH_SIZE)}`
      );

      const embeddings = [];

      for (const chunk of batch) {
        const embedding = await embedText(chunk.content);
        embeddings.push(embedding);
      }

      const chunkIds = [];

      for (let j = 0; j < batch.length; j++) {

        const chunk = batch[j];

        const { rows } = await client.query(
          `INSERT INTO chunks (document_id, content, chunk_index, page_number)
           VALUES ($1,$2,$3,$4)
           RETURNING id`,
          [documentId, chunk.content, i + j, chunk.pageNumber || 1]
        );

        chunkIds.push(rows[0].id);
      }

      await collection.add({
        ids: chunkIds,
        embeddings,
        documents: batch.map(c => c.content),
        metadatas: batch.map((c, j) => ({
          documentId,
          chunkIndex: i + j,
          pageNumber: c.pageNumber || 1,
          chunkId: chunkIds[j]
        }))
      });

      console.log(`[Embedder] Stored batch ${Math.floor(i / BATCH_SIZE) + 1}`);
    }

    await client.query(
      "UPDATE documents SET status='ready' WHERE id=$1",
      [documentId]
    );

    await client.query("COMMIT");

    console.log(`[Embedder] All ${chunks.length} chunks stored`);

  } catch (error) {

    await client.query("ROLLBACK");

    await pool.query(
      "UPDATE documents SET status='failed' WHERE id=$1",
      [documentId]
    );

    console.error("[Embedder] Failed:", error.message);

    throw error;

  } finally {
    client.release();
  }
}

async function deleteDocumentVectors(documentId) {

  const name = `doc_${documentId.replace(/-/g, "_")}`;

  try {
    await chroma.deleteCollection({ name });
    console.log(`[Embedder] Deleted collection ${name}`);
  } catch (err) {
    console.error("[Embedder] Delete failed:", err.message);
  }
}

module.exports = {
  embedText,
  embedAndStoreChunks,
  getCollection,
  deleteDocumentVectors
};