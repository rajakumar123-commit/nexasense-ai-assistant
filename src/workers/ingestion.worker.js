// ============================================================
// Ingestion Worker — NexaSense AI V7.0 God Tier
// FIX 1: role column now saved to PostgreSQL chunks table
// FIX 2: semantic chunks used directly (no re-chunking loss)
// FIX 3: metadata.role set correctly for pipeline boost
// V7.0: Metadata baking — heading/doc/page injected into chunk text
//        so vector model embeds full context, not just raw content
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
        // ✅ V8.0: State-of-the-Art "Small-to-Big" Retrieval chunking.
        // Tiny chunks (800 chars) create ultra-sharp embedding vectors matching query intents perfectly.
        // We don't lose reading context because pipeline runs Parent-Doc Expansion
        // to stitch ±5 neighbors back together during retrieval.
        const rawChunks = recursiveChunk(text, 800, 200);
        const docName   = filePath ? path.basename(filePath, path.extname(filePath)) : "Document";

        chunks = rawChunks.map((content, index) => {
          const heading = extractNearestHeading(content);
          const role    = detectChunkRole(content);

          // ✅ V7.0: Metadata Overloading
          // Bake context tags INTO the chunk text so the embedding model
          // physically "sees" the document name, heading, and page number.
          // Without this, "Semester VI" heading might be in chunk 10 but
          // the vector query hits chunk 11 (data rows) — the LLM never
          // sees the heading label.
          const contextPrefix = [
            `[Document: ${docName}]`,
            heading ? `[Section: ${heading}]` : null,
            `[Page: ${pageCount > 1 ? "multi-page" : 1}]`,
          ].filter(Boolean).join(" ");

          const enrichedContent = `${contextPrefix}\n\n${content}`;

          return {
            content     : enrichedContent,          // ⬆️ Embedded text (context-rich)
            chunk_index : index,
            role,
            metadata    : {
              page            : pageCount > 1 ? "multi-page" : 1,
              heading,
              words           : content.split(/\s+/).length,
              originalContent : content,             // ⬆️ Preserved for clean UI display
              docName,
            },
          };
        });

        logger.info(`[Worker] Using ${chunks.length} Metadata-Enriched PDF chunks (roles: ${[...new Set(chunks.map(c => c.role))].join(", ")})`);
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

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS — V7.0 Universal (Academic + Technical)
// Works for ANY document type: ML papers, textbooks, manuals,
// API docs, legal docs, syllabi, etc.
// ─────────────────────────────────────────────────────────────

/**
 * Universal heading detector:
 * Handles Markdown (# / ##), ALL-CAPS, academic keywords,
 * AND technical numbered headings ("3.1 Types of Algorithms")
 */
function extractNearestHeading(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.length < 5 || line.length > 130) continue;

    // 1. Markdown heading (# ## ###)
    if (/^#{1,4}\s/.test(line)) {
      return line.replace(/^#+\s*/, '').trim();
    }

    // 2. Numbered section heading  e.g. "3.1 Types of Machine Learning"
    //    "1. Introduction", "2.3.1 Support Vector Machines"
    if (/^(\d+\.){1,4}\s*[A-Z]/.test(line) || /^\d+\.\s+\w/.test(line)) {
      // Exclude lines that look like lists ("1. item") not headings
      if (line.split(/\s+/).length >= 2 && line.split(/\s+/).length <= 12) {
        return line.replace(/^[\d.]+\s*/, '').trim();
      }
    }

    // 3. ALL-CAPS heading (4+ chars, no period mid-line → not a sentence)
    if (
      /^[A-Z][A-Z\s\d\-–:]{4,}$/.test(line) &&
      !line.includes('.') &&
      line.split(/\s+/).length <= 8
    ) {
      return line.trim();
    }

    // 4. Academic/technical heading keywords
    if (/^(Chapter|Section|Article|Part|Semester|Unit|Module|Appendix|Introduction|Conclusion|Abstract|Overview|Summary|Background|Methodology|Results|Discussion|References|Algorithm|Definition|Theorem|Proof|Example|Exercise|Problem|Solution)\s+/i.test(line)) {
      return line.trim();
    }

    // 5. Title-Case short line (2–8 words, no punctuation at end = heading)
    if (
      line.split(/\s+/).length >= 2 &&
      line.split(/\s+/).length <= 8 &&
      /^[A-Z]/.test(line) &&
      !/[.?!,;:]$/.test(line) &&
      /^([A-Z][a-z]+\s+){1,7}[A-Z]?[a-z]*$/.test(line)
    ) {
      return line.trim();
    }
  }

  return null;
}

/**
 * Universal chunk role detector:
 * Covers academic syllabus roles AND technical document roles.
 * Roles are used for category boosting in retrieval.pipeline.js.
 */
function detectChunkRole(text) {
  // ── Academic Roles (existing) ─────────────────────
  if (/Course Title|Course Objective|Course Outcome|CO Statement/i.test(text))
    return "COURSE_CONTENT";
  if (/Semester\s*[:\-–]\s*(I|II|III|IV|V|VI|VII|VIII)/i.test(text))
    return "SEMESTER_SECTION";
  if (/\bLab\b|Practical|Sessional/i.test(text))
    return "PRACTICAL";
  if (/\bElective\b/i.test(text))
    return "ELECTIVE";

  // ── Technical / ML Roles (V7.0) ──────────────────

  // Definition block  ("X is defined as...", "Definition:", "formally:")
  if (/\bDefinition\b|\bis\s+defined\s+as\b|\bformally\s*,|\bdenoted\s+by\b|\bis\s+a\s+(?:type|kind|form)\s+of\b/i.test(text))
    return "DEFINITION";

  // Algorithm / procedure block
  if (/\bAlgorithm\b|\bPseudocode\b|\bstep\s+\d+\b|\bInput:|\bOutput:|\bProcedure:|\bFunction:|BEGIN\s*\n|END\s*\n/i.test(text))
    return "ALGORITHM";

  // Code block (detected by indentation patterns or code keywords)
  if (/```[\s\S]*```|\bdef\s+\w+\s*\(|\bclass\s+\w+|\bimport\s+\w+|\bfunction\s+\w+\s*\(|\bvoid\s+\w+\s*\(/m.test(text))
    return "CODE_BLOCK";

  // Formula / equation heavy
  if (/(\\[a-zA-Z]+\{|\\frac|\\sum|\\int|\\prod|\\sigma|[=\u2208\u2207\u03a3\u03c3\u03bc].*[=\u2208\u2207\u03a3]+|\d+\.\d+\s*[\+\-\*\/]\s*\d)/m.test(text))
    return "FORMULA";

  // Table data (pipe chars or structured grid)
  if (/\|.+\|.+\|/m.test(text) || /[-+]{3,}/.test(text))
    return "TABLE_DATA";

  // Example / case study
  if (/\bExample\b|\bCase Study\b|\bIllustration\b|\bFor instance\b|\bConsider\b|\be\.g\.\b/i.test(text))
    return "EXAMPLE";

  // Overview / introduction / conclusion
  if (/\bIntroduction\b|\bOverview\b|\bBackground\b|\bMotivation\b|\bIn this chapter\b|\bIn this section\b/i.test(text))
    return "OVERVIEW";

  // Contact / metadata
  if (/phone|mobile|email|address|contact|location|whatsapp/i.test(text))
    return "CONTACT_INFO";

  // FAQ
  if (/\bFAQ\b|\bFrequently Asked\b|\bQ:\s|\bA:\s/i.test(text))
    return "FAQ";

  return "GENERAL_CONTENT";
}

module.exports = ingestionWorker;