// ============================================================
// Query Stream Controller
// NexaSense AI Assistant
// Streaming RAG responses using SSE (True Real-Time Streaming)
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
    // Ensure conversation exists BEFORE deducting credits
    // ✅ FIX BUG2: Conversation was previously created AFTER credit deduction.
    // If the INSERT failed (DB timeout), credit was consumed with no conversation
    // and no refund path. Now conversation is resolved first — safe order.
    // ---------------------------------------------------------

    let convId = conversationId;

    if (!convId && userId) {
      const { rows } = await db.query(
        `INSERT INTO conversations (user_id, document_id)
         VALUES ($1,$2)
         RETURNING id`,
        [userId, documentId === "all" ? null : documentId]
      );
      convId = rows[0].id;
    }

    // ---------------------------------------------------------
    // CREDIT CHECK + DEDUCTION (Atomic — now safely AFTER conversation created)
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

    // ---------------------------------------------------------
    // Run RAG pipeline with REAL-TIME Streaming Callback
    // ---------------------------------------------------------

    let streamedTokens = 0;

    const result = await runRetrievalPipeline({
      userId,
      documentId,
      question,
      conversationId: convId || null,
      onToken: (token) => {
        streamedTokens++;
        sendToken(res, token); // ✅ Instantly send native LLM tokens to client
      }
    });

    // Stop heartbeat — we have the answer
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;

    // ---------------------------------------------------------
    // Graceful Stream Fallback
    // If the pipeline hit the Cache or a General Knowledge fallback, 
    // `onToken` won't fire. We simulate the stream here so UX remains smooth.
    // ---------------------------------------------------------

    if (streamedTokens === 0 && result.answer) {
      const tokens = result.answer.split(" ");
      for (const token of tokens) {
        sendToken(res, token + " ");
        await new Promise(r => setTimeout(r, 10)); // simulated typing
      }
    }

    // ---------------------------------------------------------
    // Send metadata
    // ---------------------------------------------------------

    sendMeta(res, {
      sources:         result.sources        || [],
      provider:        result.provider       || "rag",
      confidence:      result.confidence     ?? null,
      chunksRetrieved: result.chunksRetrieved,
      chunksUsed:      result.chunksUsed,
      responseTimeMs:  result.responseTimeMs,
      tokenEstimate:   result.tokenEstimate,
      fromCache:       result.fromCache      || false,
      conversationId:  convId
    });

    // ---------------------------------------------------------
    // Record metrics
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

  } catch (error) {

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