// ============================================================
// Ingestion Worker
// NexaSense AI Assistant
// FIXES:
//   1. Added dotenv.config() — worker is a standalone process
//   2. Re-throw error after marking DB — BullMQ sees the failure
//      and triggers the retry/backoff configured on the queue
//   3. Clean up temp file in `finally` block regardless of outcome
//   4. Process-level crash guards — ONNX background threads emit
//      unhandled errors after job completion. Without these guards
//      the process crashes and BullMQ retries the completed job.
//   5. Skip-if-already-ready guard — if BullMQ retries a job that
//      already succeeded (e.g. after a worker restart), we bail
//      out immediately instead of re-processing.
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
// FIX 4: Process-level crash guards
// ONNX runtime fires errors from background threads AFTER the
// job has already completed. Without these handlers the Node
// process exits, BullMQ marks the in-progress job as failed,
// and retries a document that was already successfully embedded.
// We log the error but keep the worker alive.
// ------------------------------------------------------------

process.on("uncaughtException", (err) => {
  // Ignore ONNX/WASM internal errors — they are non-fatal
  // side-effects of single-threaded WASM cleanup
  if (err?.message?.includes("onnxruntime") ||
      err?.message?.includes("DefaultLogger") ||
      err?.message?.includes("blob:")) {
    logger.warn("[Worker] Non-fatal ONNX background error (ignored):", err.message);
    return;
  }
  logger.error("[Worker] Uncaught exception — exiting:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes("onnxruntime") ||
      msg.includes("DefaultLogger") ||
      msg.includes("blob:")) {
    logger.warn("[Worker] Non-fatal ONNX unhandled rejection (ignored):", msg);
    return;
  }
  logger.error("[Worker] Unhandled rejection:", reason);
});


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

      // ----------------------------------------
      // FIX 5: Skip-if-already-ready guard
      // If BullMQ retries a job that already completed (e.g. the
      // worker restarted mid-completion, or a false retry was
      // triggered by an ONNX background error), bail immediately.
      // ----------------------------------------

      const { rows } = await db.query(
        "SELECT status FROM documents WHERE id=$1",
        [documentId]
      );

      if (rows[0]?.status === "ready") {
        logger.info(`[Worker] Skipping ${documentId} — document already ready`);
        return;
      }

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
        throw new Error("No text could be extracted from this file");
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
        // NOTE: search_vector is auto-populated by the DB trigger
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

      // Re-throw so BullMQ records this as a job failure
      // and triggers the retry + exponential backoff
      throw error;

    } finally {

      // Always clean up the uploaded temp file
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
  // ONNX fires these after WASM session teardown — non-fatal
  if (err?.message?.includes("onnxruntime") ||
      err?.message?.includes("DefaultLogger") ||
      err?.message?.includes("blob:")) {
    logger.warn("[Worker] Non-fatal ONNX worker event (ignored):", err.message);
    return;
  }
  logger.error("[Worker] Worker error:", err.message);
});


module.exports = ingestionWorker;