// ============================================================
// Query Stream Controller
// NexaSense AI Assistant
// Streaming RAG responses using SSE
// ============================================================

const { runRetrievalPipeline } = require("../pipelines/retrieval.pipeline");
const { recordQueryMetrics }   = require("../services/metrics.service");

const {
  initStream,
  sendToken,
  sendMeta,
  sendError,
  heartbeat,
  closeStream
} = require("../services/streaming.service");

const db     = require("../db");
const logger = require("../utils/logger");


// ============================================================
// POST /api/query/stream
// ============================================================

async function streamQuery(req, res) {

  const start = Date.now();

  // Heartbeat interval — prevents nginx/proxy from killing
  // idle connections while the pipeline runs
  let heartbeatTimer = null;

  try {

    initStream(res);

    // Start heartbeat every 15s
    heartbeatTimer = setInterval(() => heartbeat(res), 15000);

    let { documentId, question, conversationId } = req.body;

    const userId = req.user?.id || null;

    documentId = String(documentId || "").trim();
    question   = String(question   || "").trim();


    // ---------------------------------------------------------
    // Validation
    // ---------------------------------------------------------

    if (!documentId) {
      clearInterval(heartbeatTimer);
      sendError(res, "documentId required");
      return closeStream(res);
    }

    if (!question) {
      clearInterval(heartbeatTimer);
      sendError(res, "question required");
      return closeStream(res);
    }


    // ---------------------------------------------------------
    // Check document exists
    // ---------------------------------------------------------

    if (documentId !== "all") {
      const docCheck = await db.query(
        `SELECT id FROM documents WHERE id=$1`,
        [documentId]
      );

      if (!docCheck.rows.length) {
        clearInterval(heartbeatTimer);
        sendError(res, "document not found");
        return closeStream(res);
      }
    }


    // ---------------------------------------------------------
    // Ensure conversation exists
    // ---------------------------------------------------------

    let convId = conversationId;

    // ---------------------------------------------------------
    // CREDIT CHECK + DEDUCTION (Atomic — same logic as /api/query)
    // Without this guard, users bypass credits via the stream endpoint.
    // ---------------------------------------------------------

    if (userId) {
      const deductResult = await db.query(
        `UPDATE users
         SET credits = credits - 1
         WHERE id = $1 AND credits > 0
         RETURNING credits`,
        [userId]
      );

      if (deductResult.rowCount === 0) {
        clearInterval(heartbeatTimer);
        sendError(res, "No credits remaining. Please upgrade your plan.");
        return closeStream(res);
      }
    }

    if (!convId && userId) {

      const { rows } = await db.query(
        `INSERT INTO conversations (user_id, document_id)
         VALUES ($1,$2)
         RETURNING id`,
        [userId, documentId]
      );

      convId = rows[0].id;

    }


    // ---------------------------------------------------------
    // Run RAG pipeline
    // Pipeline handles ALL fallbacks internally:
    //   chunks found   → Groq RAG → Gemini reasoning
    //   chunks missing → Gemini context mode → Groq fallback
    //   out of domain  → rejection message
    // Do NOT add extra Gemini calls here — it bypasses domain
    // restriction and double-bills the API.
    // ---------------------------------------------------------

    const result = await runRetrievalPipeline({
      userId,
      documentId,
      question,
      conversationId: convId || null
    });

    // Stop heartbeat — we have the answer
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;


    // ---------------------------------------------------------
    // Stream answer tokens
    // ---------------------------------------------------------

    const tokens = (result.answer || "").split(" ");

    for (const token of tokens) {

      sendToken(res, token + " ");

      // natural typing effect
      await new Promise(r => setTimeout(r, 10));

    }


    // ---------------------------------------------------------
    // Send metadata
    // ---------------------------------------------------------

    sendMeta(res, {
      sources:       result.sources        || [],
      provider:      result.provider       || "rag",
      confidence:    result.confidence     ?? null,
      chunksRetrieved: result.chunksRetrieved,
      chunksUsed:    result.chunksUsed,
      responseTimeMs: result.responseTimeMs,
      tokenEstimate: result.tokenEstimate,
      fromCache:     result.fromCache      || false,
      conversationId: convId
    });


    // ---------------------------------------------------------
    // Record metrics
    // Pipeline records metrics internally for non-stream path.
    // Stream path records here with stream flag.
    // ---------------------------------------------------------

    recordQueryMetrics({
      userId,
      documentId,
      totalMs:   Date.now() - start,
      fromCache: result.fromCache || false
    }).catch(() => {});


    logger.info(
      `[StreamQuery] ${(result.provider || "rag").toUpperCase()} | ` +
      `${result.responseTimeMs}ms | ` +
      `chunks:${result.chunksUsed}/${result.chunksRetrieved} | ` +
      `sources:${result.sources?.length || 0} | ` +
      `cache:${result.fromCache}`
    );

    closeStream(res);

  }

  catch (error) {

    if (heartbeatTimer) clearInterval(heartbeatTimer);

    logger.error("[StreamQuery] Fatal:", error);

    // Refund credit — pipeline failed after atomic deduction
    const userId = req.user?.id;
    if (userId) {
      db.query(
        `UPDATE users SET credits = credits + 1 WHERE id = $1`,
        [userId]
      ).catch((e) => logger.warn("[Credits] Stream refund failed:", e.message));
    }

    sendError(res, error.message);

    closeStream(res);

  }

}


module.exports = {
  streamQuery
};