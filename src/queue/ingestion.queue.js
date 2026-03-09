const { embedAndStoreChunks } = require("../services/embedder.service");
const { extractText } = require("../services/document.service");
const recursiveChunk = require("../utils/recursiveChunk");

const { pool } = require("../db");

// simple in-memory queue
const ingestionQueue = [];

let isProcessing = false;


// ─────────────────────────────
// Add job to queue
// ─────────────────────────────
function addIngestionJob({ documentId, filePath }) {

  ingestionQueue.push({
    documentId,
    filePath
  });

  processQueue();
}


// ─────────────────────────────
// Process queue
// ─────────────────────────────
async function processQueue() {

  if (isProcessing) return;

  isProcessing = true;

  while (ingestionQueue.length > 0) {

    const job = ingestionQueue.shift();

    try {

      console.log(`[Queue] Processing document ${job.documentId}`);

      // 1️⃣ Extract text from PDF
      const { text } = await extractText(job.filePath);

      // 2️⃣ Chunk the text
      const rawChunks = recursiveChunk(text);

      const chunks = rawChunks.map((content, index) => ({
        content,
        pageNumber: 1,
        chunkIndex: index
      }));

      console.log(`[Queue] Created ${chunks.length} chunks`);

      // 3️⃣ Embed and store
      await embedAndStoreChunks(job.documentId, chunks);

      // 4️⃣ Update document status
      await pool.query(
        `UPDATE documents SET status='ready' WHERE id=$1`,
        [job.documentId]
      );

      console.log(`[Queue] Completed document ${job.documentId}`);

    }

    catch (error) {

      console.error("[Queue] Failed:", error.message);

      await pool.query(
        `UPDATE documents SET status='failed' WHERE id=$1`,
        [job.documentId]
      );

    }

  }

  isProcessing = false;
}


module.exports = {
  addIngestionJob
};