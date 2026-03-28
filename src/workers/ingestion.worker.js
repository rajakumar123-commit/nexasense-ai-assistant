// ============================================================
// Ingestion Worker — NexaSense AI V5.0 "Outrageous" Edition
// Unified: PDF, DOCX, TXT, WEB | High-Concurrency | Atomic
// ============================================================

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { Worker } = require("bullmq");
const connection = require("../config/redis");

// Services
const { embedAndStoreChunks } = require("../services/embedder.service");
const { extractText } = require("../services/document.service");
const { scrapeUrl } = require("../services/scraper.service");
const recursiveChunk = require("../utils/recursiveChunk");
const db = require("../db");
const logger = require("../utils/logger");

const QUEUE_NAME = "document-ingestion";

// ------------------------------------------------------------
// CRASH GUARDS: Keep the worker alive during ONNX memory spikes
// ------------------------------------------------------------
process.on("uncaughtException", (err) => {
  if (err?.message?.includes("onnxruntime") || err?.message?.includes("blob:")) {
    logger.warn("[Worker] Non-fatal ONNX background error ignored.");
    return;
  }
  logger.error("[Worker] Fatal Exception:", err);
  process.exit(1);
});

// ------------------------------------------------------------
// THE WORKER
// ------------------------------------------------------------
const ingestionWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { documentId, filePath: rawFilePath, url } = job.data;
    let filePath = rawFilePath ? path.resolve(process.cwd(), rawFilePath) : null;

    try {
      // 1. PHASE: Extraction
      await db.query("UPDATE documents SET status='extracting' WHERE id=$1", [documentId]);
      
      let text = "", pageCount = 1, semanticChunks = null, docTitle = "Document";

      if (url) {
        const scraped = await scrapeUrl(url);
        text = scraped.content;
        semanticChunks = scraped.chunks;
        docTitle = scraped.title;
        await db.query("UPDATE documents SET original_name=$1, file_name=$1 WHERE id=$2", [docTitle, documentId]);
      } else {
        const extracted = await extractText(filePath);
        text = extracted.text;
        pageCount = extracted.pageCount;
      }

      if (!text?.trim()) throw new Error("Source contained no extractable text.");

      // 2. PHASE: Strategic Chunking
      await db.query("UPDATE documents SET status='chunking' WHERE id=$1", [documentId]);
      
      let chunks = [];
      if (semanticChunks?.length > 0) {
        // Link logic: Role-based tagging for the "V7 Reasoning" prompt
        chunks = semanticChunks.map(c => ({
          content: `[Category: ${c.role}]\n\n${c.text}`,
          chunk_index: c.chunkIndex,
          metadata: { source: url, type: c.role }
        }));
      } else {
        // File logic: Recursive overlapping chunks
        const rawChunks = recursiveChunk(text);
        chunks = rawChunks.map((content, index) => ({
          content,
          chunk_index: index,
          metadata: { page: pageCount > 1 ? "Check PDF" : 1 }
        }));
      }

      // 3. PHASE: Atomic Operations (The "Outrageous" Speed Upgrade)
      // We run Database saving and Vector Embedding in PARALLEL
      await db.query("UPDATE documents SET status='embedding' WHERE id=$1", [documentId]);

      const saveToPostgres = async () => {
        const client = await db.pool.connect();
        try {
          await client.query("BEGIN"); // ATOMIC TRANSACTION
          await client.query("DELETE FROM chunks WHERE document_id = $1", [documentId]);
          
          for (const chunk of chunks) {
            await client.query(
              "INSERT INTO chunks (document_id, content, chunk_index) VALUES ($1, $2, $3)",
              [documentId, chunk.content, chunk.chunk_index]
            );
          }
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      };

      // Execute both heavy tasks simultaneously
      await Promise.all([
        saveToPostgres(),
        embedAndStoreChunks(documentId, chunks)
      ]);

      // 4. PHASE: Finalize
      await db.query(
        "UPDATE documents SET status='ready', chunk_count=$1, updated_at=NOW() WHERE id=$2",
        [chunks.length, documentId]
      );

      logger.info(`[Worker] Success! ${documentId} indexed with ${chunks.length} chunks.`);

    } catch (error) {
      logger.error(`[Worker] Failed ${documentId}: ${error.message}`);
      await db.query("UPDATE documents SET status='error', error_msg=$1 WHERE id=$2", [error.message, documentId]);
      throw error; 
    } finally {
      // Disk hygiene: Always delete the temp file
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  },
  { 
    connection, 
    concurrency: 1, 
    lockDuration: 60000 // 1-minute lock for heavy scrapes
  }
);

module.exports = ingestionWorker;