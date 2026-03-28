// ============================================================
// Ingestion Worker — NexaSense AI V5.1 God Tier
// FIX 1: role column now saved to PostgreSQL chunks table
// FIX 2: semantic chunks used directly (no re-chunking loss)
// FIX 3: metadata.role set correctly for pipeline boost
// ============================================================

require("dotenv").config();
const path = require("path");
const fs   = require("fs");

const { Worker } = require("bullmq");
const connection = require("../config/redis");

const { embedAndStoreChunks } = require("../services/embedder.service");
const { extractText }          = require("../services/document.service");
const { scrapeUrl }            = require("../services/scraper.service");
const recursiveChunk           = require("../utils/recursiveChunk");
const db                       = require("../db");
const logger                   = require("../utils/logger");

const QUEUE_NAME = "document-ingestion";

// ─────────────────────────────────────────────────────────────
// CRASH GUARDS — keep worker alive during ONNX memory spikes
// ─────────────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  if (
    err?.message?.includes("onnxruntime") ||
    err?.message?.includes("DefaultLogger") ||
    err?.message?.includes("blob:")
  ) {
    logger.warn("[Worker] Non-fatal ONNX background error ignored.");
    return;
  }
  logger.error("[Worker] Fatal Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason?.message || String(reason);
  if (
    msg.includes("onnxruntime") ||
    msg.includes("DefaultLogger") ||
    msg.includes("blob:")
  ) {
    logger.warn("[Worker] Non-fatal ONNX rejection ignored:", msg);
    return;
  }
  logger.error("[Worker] Unhandled rejection:", reason);
});

// ─────────────────────────────────────────────────────────────
// WORKER
// ─────────────────────────────────────────────────────────────
const ingestionWorker = new Worker(
  QUEUE_NAME,

  async (job) => {
    const { documentId, filePath: rawFilePath, url } = job.data;
    const filePath = rawFilePath ? path.resolve(process.cwd(), rawFilePath) : null;

    try {
      // ── Skip-if-ready guard ───────────────────────────────
      const { rows } = await db.query(
        "SELECT status FROM documents WHERE id=$1",
        [documentId]
      );
      if (rows[0]?.status === "ready") {
        logger.info(`[Worker] Skipping ${documentId} — already ready`);
        return;
      }

      // ── PHASE 1: Extraction ───────────────────────────────
      await db.query(
        "UPDATE documents SET status='extracting' WHERE id=$1",
        [documentId]
      );

      let text           = "";
      let pageCount      = 1;
      let semanticChunks = null;

      if (url) {
        logger.info(`[Worker] Scraping URL: ${url}`);
        const scraped = await scrapeUrl(url);

        text           = scraped.content;
        semanticChunks = scraped.chunks;   // role-tagged chunks from V5.1

        await db.query(
          "UPDATE documents SET original_name=$1, file_name=$1 WHERE id=$2",
          [scraped.title, documentId]
        );
        logger.info(`[Worker] Scraped: ${scraped.chunks?.length ?? 0} semantic chunks`);

      } else {
        const extracted = await extractText(filePath);
        text      = extracted.text;
        pageCount = extracted.pageCount;
      }

      if (!text?.trim()) {
        throw new Error("Source contained no extractable text.");
      }

      // ── PHASE 2: Chunking ─────────────────────────────────
      await db.query(
        "UPDATE documents SET status='chunking' WHERE id=$1",
        [documentId]
      );

      let chunks = [];

      if (semanticChunks?.length > 0) {
        // ✅ FIX 2: Use V5.1 semantic chunks directly
        // Role is stored separately — NOT embedded in content text
        // Pipeline boost reads c.metadata.role — this feeds it correctly
        chunks = semanticChunks.map(c => ({
          content     : c.text,                         // clean text, no prefix
          chunk_index : c.chunkIndex,
          role        : c.role,                         // ✅ stored in role column
          metadata    : {
            source : url,
            role   : c.role,                            // ✅ pipeline reads this
            words  : c.wordCount,
          },
        }));

        logger.info(`[Worker] Using ${chunks.length} semantic chunks (roles: ${[...new Set(chunks.map(c => c.role))].join(", ")})`);

      } else {
        // File logic: recursive overlapping chunks
        const rawChunks = recursiveChunk(text);
        chunks = rawChunks.map((content, index) => ({
          content,
          chunk_index : index,
          role        : "GENERAL_CONTENT",
          metadata    : { page: pageCount > 1 ? "multi-page" : 1 },
        }));

        logger.info(`[Worker] Using ${chunks.length} recursive chunks`);
      }

      if (!chunks.length) {
        throw new Error("Chunking produced zero chunks.");
      }

      // ── PHASE 3: Atomic Parallel Save ────────────────────
      await db.query(
        "UPDATE documents SET status='embedding' WHERE id=$1",
        [documentId]
      );

      const saveToPostgres = async () => {
        const client = await db.pool.connect();
        try {
          await client.query("BEGIN");

          await client.query(
            "DELETE FROM chunks WHERE document_id = $1",
            [documentId]
          );

          for (const chunk of chunks) {
            // ✅ FIX 1: role column saved — schema already has it
            await client.query(
              `INSERT INTO chunks
                 (document_id, content, chunk_index, role, metadata)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                documentId,
                chunk.content,
                chunk.chunk_index,
                chunk.role || "GENERAL_CONTENT",
                JSON.stringify(chunk.metadata || {}),
              ]
            );
          }

          await client.query("COMMIT");
          logger.info(`[Worker] Saved ${chunks.length} chunks to PostgreSQL`);

        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      };

      // ✅ FIX W4: Run sequentially, NOT Promise.all.
      // embedAndStoreChunks relies on querying the Postgres 'chunks' table for the
      // UUIDs generated by saveToPostgres. If run in parallel, Chroma queries an
      // uncommitted DB state, finds 0 IDs, and skips vector insertion entirely!
      await saveToPostgres();
      await embedAndStoreChunks(documentId, chunks);

      // ── PHASE 4: Finalize ─────────────────────────────────
      await db.query(
        `UPDATE documents
           SET status='ready', chunk_count=$1, updated_at=NOW()
         WHERE id=$2`,
        [chunks.length, documentId]
      );

      logger.info(`[Worker] ✅ ${documentId} ready — ${chunks.length} chunks indexed`);

    } catch (error) {
      logger.error(`[Worker] Failed ${documentId}: ${error.message}`, error.stack);

      await db.query(
        "UPDATE documents SET status='error', error_msg=$1 WHERE id=$2",
        [error.message, documentId]
      ).catch(() => {});

      throw error; // BullMQ retry + backoff

    } finally {
      // Always clean up temp file
      try {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`[Worker] Cleaned temp file: ${filePath}`);
        }
      } catch (cleanErr) {
        logger.warn("[Worker] Temp cleanup failed:", cleanErr.message);
      }
    }
  },

  {
    connection,
    concurrency  : 1,
    lockDuration : 60_000,
  }
);

// ─────────────────────────────────────────────────────────────
// WORKER EVENTS
// ─────────────────────────────────────────────────────────────
ingestionWorker.on("completed", job => {
  logger.info(`[Worker] Job completed: ${job.id}`);
});

ingestionWorker.on("failed", (job, err) => {
  logger.error(`[Worker] Job failed: ${job?.id} — ${err.message}`);
});

ingestionWorker.on("error", err => {
  if (
    err?.message?.includes("onnxruntime") ||
    err?.message?.includes("DefaultLogger") ||
    err?.message?.includes("blob:")
  ) {
    logger.warn("[Worker] Non-fatal ONNX worker event ignored:", err.message);
    return;
  }
  logger.error("[Worker] Worker error:", err.message);
});

module.exports = ingestionWorker;