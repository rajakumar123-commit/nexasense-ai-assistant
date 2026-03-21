// ============================================================
// Ingestion Worker
// NexaSense AI Assistant
// FIXES:
//   1. Added dotenv.config() — worker is a standalone process
//   2. Re-throw error after marking DB — BullMQ sees the failure
//      and triggers the retry/backoff configured on the queue
//   3. Clean up temp file in `finally` block regardless of outcome
// ============================================================

require("dotenv").config();

const path = require("path");
const fs   = require("fs");

const { Worker } = require("bullmq");

const connection = require("../config/redis");

const { embedAndStoreChunks } = require("../services/embedder.service");
const { extractText }          = require("../services/document.service");
const recursiveChunk           = require("../utils/recursiveChunk");

const { summarizeDocument }   = require("../services/documentSummary.service");
const { generateSuggestions } = require("../services/questionSuggestion.service");

const db     = require("../db");
const logger = require("../utils/logger");

const QUEUE_NAME = "document-ingestion";


// ------------------------------------------------------------
// Worker
// ------------------------------------------------------------

const ingestionWorker = new Worker(

  QUEUE_NAME,

  async (job) => {

    const { documentId, filePath: rawFilePath } = job.data;

    // Resolve to absolute path — multer gives relative paths like "uploads/foo.pdf"
    // Inside Docker the working directory is /app so path.resolve works correctly
    const filePath = path.isAbsolute(rawFilePath)
      ? rawFilePath
      : path.resolve(process.cwd(), rawFilePath);

    try {

      logger.info(`[Worker] Start ingestion: ${documentId}`);

      // ----------------------------------------
      // Extract text
      // ----------------------------------------

      await db.query(
        "UPDATE documents SET status='extracting' WHERE id=$1",
        [documentId]
      );

      const { text, pageCount } = await extractText(filePath);

      if (!text || !text.trim()) {
        throw new Error("No text extracted from PDF");
      }

      logger.info(`[Worker] Extracted ${pageCount} pages`);


      // ----------------------------------------
      // Chunking
      // ----------------------------------------

      await db.query(
        "UPDATE documents SET status='chunking' WHERE id=$1",
        [documentId]
      );

      const rawChunks = recursiveChunk(text);

      if (!rawChunks.length) {
        throw new Error("Chunking produced zero chunks");
      }

      const chunks = rawChunks.map((content, index) => ({
        content,
        chunk_index: index
      }));

      logger.info(`[Worker] Created ${chunks.length} chunks`);


      // ----------------------------------------
      // Save chunks to PostgreSQL for keyword search
      // ----------------------------------------

      await db.query(
        "DELETE FROM chunks WHERE document_id = $1",
        [documentId]
      );

      for (const chunk of chunks) {
        await db.query(
          `INSERT INTO chunks (document_id, content, chunk_index)
           VALUES ($1, $2, $3)`,
          [documentId, chunk.content, chunk.chunk_index]
        );
        // NOTE: search_vector is now auto-populated by the DB trigger
      }

      logger.info(`[Worker] Saved ${chunks.length} chunks to PostgreSQL`);


      // ----------------------------------------
      // Embeddings
      // ----------------------------------------

      await db.query(
        "UPDATE documents SET status='embedding' WHERE id=$1",
        [documentId]
      );

      await embedAndStoreChunks(documentId, chunks);


      // ----------------------------------------
      // Document Intelligence (non-critical)
      // ----------------------------------------

      try {

        await summarizeDocument(documentId);
        await generateSuggestions(documentId);

      } catch (err) {

        logger.warn("[Worker] Summary/Suggestions skipped:", err.message);

      }


      // ----------------------------------------
      // Mark document ready
      // ----------------------------------------

      await db.query(
        `UPDATE documents
         SET status='ready',
             chunk_count=$1
         WHERE id=$2`,
        [chunks.length, documentId]
      );

      logger.info(`[Worker] Completed ingestion: ${documentId}`);

    } catch (error) {

      logger.error(`[Worker] Failed ${documentId}: ${error.message}`, error.stack);

      await db.query(
        `UPDATE documents
         SET status='error',
             error_msg=$1
         WHERE id=$2`,
        [error.message, documentId]
      ).catch(() => {});

      // FIX: Re-throw so BullMQ records this as a job failure
      // and triggers the retry + exponential backoff configured
      // in the queue (attempts=3, delay=3000, type="exponential")
      throw error;

    } finally {

      // FIX: Always clean up the uploaded temp file
      try {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`[Worker] Cleaned up temp file: ${filePath}`);
        }
      } catch (cleanupErr) {
        logger.warn("[Worker] Temp file cleanup failed:", cleanupErr.message);
      }

    }

  },

  {
    connection,
    concurrency: 1  // Process one document at a time — WASM is single-threaded
  }

);


// ------------------------------------------------------------
// Worker events
// ------------------------------------------------------------

ingestionWorker.on("completed", job => {
  logger.info(`[Worker] Job completed: ${job.id}`);
});

ingestionWorker.on("failed", (job, err) => {
  logger.error(`[Worker] Job failed: ${job?.id} — ${err.message}`);
});

ingestionWorker.on("error", err => {
  logger.error("[Worker] Worker error:", err.message);
});


module.exports = ingestionWorker;