const { runRetrievalPipeline } = require("../pipelines/retrieval.pipeline");
const logger = require("../utils/logger");

// ─────────────────────────────────────────────────────────────
// Query Controller — handles POST /api/query
//
// Request body:
//   documentId     (required) — UUID of uploaded document
//   question       (required) — user's question string
//   conversationId (optional) — UUID for multi-turn history
//
// Response includes:
//   answer         — LLM-generated structured answer
//   sources        — chunks used, with preview + similarity
//   responseTimeMs — how long the pipeline took
//   fromCache      — true if served from cache
// ─────────────────────────────────────────────────────────────
async function queryDocument(req, res) {
  const requestStart = Date.now();

  try {
    const { documentId, question, conversationId } = req.body;

    // ── Input validation ─────────────────────────────────────
    if (!documentId || typeof documentId !== "string") {
      return res.status(400).json({
        success: false,
        error:   "documentId is required and must be a string"
      });
    }

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error:   "question is required and cannot be empty"
      });
    }

    if (question.trim().length > 1000) {
      return res.status(400).json({
        success: false,
        error:   "question must be under 1000 characters"
      });
    }

    // ── Run pipeline ─────────────────────────────────────────
    const result = await runRetrievalPipeline({
      documentId:     documentId.trim(),
      question:       question.trim(),
      conversationId: conversationId || null
    });

    // ── Log for monitoring ────────────────────────────────────
    logger.info(
      `[Query] ${result.fromCache ? "CACHE" : "FRESH"} | ` +
      `${result.responseTimeMs}ms | ` +
      `sources:${result.sources?.length || 0} | ` +
      `"${question.slice(0, 50)}"`
    );

    // ── Send response ─────────────────────────────────────────
    return res.status(200).json({
      success:        true,
      question:       question.trim(),
      answer:         result.answer,
      sources:        result.sources,
      fromCache:      result.fromCache,
      responseTimeMs: result.responseTimeMs,
      tokenEstimate:  result.tokenEstimate || null
    });

  } catch (error) {
  logger.error(`[Query] Unhandled error: ${error.message}`);
  logger.error(error.stack);  // ← add this line

  return res.status(500).json({
    success: false,
    error:   error.message,   // ← change this to show real error
    responseTimeMs: Date.now() - requestStart
  });

  }
}

module.exports = { queryDocument };