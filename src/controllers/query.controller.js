// ============================================================
// Query Controller
// NexaSense AI Assistant v2.3
// Multi-Document RAG Controller (Production)
// ============================================================

const { runRetrievalPipeline } = require("../pipelines/retrieval.pipeline");

const db = require("../db");
const logger = require("../utils/logger");


// ------------------------------------------------------------
// Save metrics
// ------------------------------------------------------------
async function saveMetrics(userId, documentId, result) {

  try {

    await db.query(
      `INSERT INTO query_metrics
       (user_id, document_id, question, total_ms, chunks_retrieved, chunks_used, from_cache)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        userId,
        documentId,
        result.question || null,
        result.responseTimeMs || 0,
        result.chunksRetrieved || 0,
        result.chunksUsed || 0,
        result.fromCache || false
      ]
    );

  } catch (err) {

    logger.warn("[Metrics] Save failed:", err.message);

  }

}


// ============================================================
// POST /api/query
// ============================================================
async function queryDocument(req, res) {

  const start = Date.now();

  try {

    let { documentId, question, conversationId } = req.body;

    const userId = req.user?.id || null;

    documentId = String(documentId || "").trim();
    question   = String(question || "").trim();


    // ---------------------------------------------------------
    // Validation
    // ---------------------------------------------------------

    if (!documentId)
      return res.status(400).json({
        success:false,
        error:"documentId required"
      });

    if (!question)
      return res.status(400).json({
        success:false,
        error:"question required"
      });

    if (question.length > 1000)
      return res.status(400).json({
        success:false,
        error:"question too long"
      });


    // ---------------------------------------------------------
    // Ensure document exists
    // ---------------------------------------------------------

    const docCheck = await db.query(
      `SELECT id FROM documents WHERE id=$1`,
      [documentId]
    );

    if (!docCheck.rows.length)
      return res.status(404).json({
        success:false,
        error:"document not found"
      });


    // ---------------------------------------------------------
    // Ensure conversation exists
    // ---------------------------------------------------------

    let convId = conversationId;

    if (convId) {

      const convCheck = await db.query(
        `SELECT id FROM conversations WHERE id=$1`,
        [convId]
      );

      if (!convCheck.rows.length) convId = null;

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
    // Run Retrieval Pipeline
    // ---------------------------------------------------------

    let result = await runRetrievalPipeline({

      userId, // enables multi-document retrieval
      documentId,
      question,
      conversationId: convId || null

    });


    // ---------------------------------------------------------
    // Ensure safe defaults
    // ---------------------------------------------------------

    result = {
      answer: result?.answer || "",
      sources: result?.sources || [],
      pipeline: result?.pipeline || null,
      responseTimeMs: result?.responseTimeMs || (Date.now() - start),
      chunksRetrieved: result?.chunksRetrieved || 0,
      chunksUsed: result?.chunksUsed || 0,
      tokenEstimate: result?.tokenEstimate || 0,
      fromCache: result?.fromCache || false
    };

    let provider = "rag";


    // ---------------------------------------------------------
    // Prevent hallucination (RAG mode only)
    // ---------------------------------------------------------

    // We only enforce the hard "not available" string if the system 
    // actually tried to perform standard RAG. If the pipeline explicitly 
    // switched to Gemini Context Mode, it will independently decide whether 
    // the query is in-domain or out-of-scope, and we must preserve its answer.
    const isGeminiContextMode = result.provider === "gemini" || result.provider === "groq-fallback";

    if (!isGeminiContextMode && !result.sources.length) {

      result.answer =
        "This information is not available in the uploaded document.";

      provider = "rag";

    } else if (result.provider) {
        provider = result.provider;
    }


    // ---------------------------------------------------------
    // Save metrics (non-blocking)
    // ---------------------------------------------------------

    if (userId) {

      saveMetrics(userId, documentId, {
        question,
        ...result
      }).catch(()=>{});

    }


    logger.info(
      `[Query] ${provider.toUpperCase()} | ` +
      `${result.responseTimeMs}ms | ` +
      `sources:${result.sources.length} | ` +
      `user:${userId || "anonymous"}`
    );


    // ---------------------------------------------------------
    // Send response
    // ---------------------------------------------------------

    return res.status(200).json({

      success:true,
      question,
      answer:result.answer,

      sources:result.sources,
      pipeline:result.pipeline,

      provider,

      fromCache:result.fromCache,
      responseTimeMs:result.responseTimeMs,
      tokenEstimate:result.tokenEstimate,

      conversationId:convId

    });

  }

  catch(error){

    logger.error("[Query] Fatal:", error);

    return res.status(500).json({
      success:false,
      error:error.message,
      responseTimeMs:Date.now()-start
    });

  }

}

module.exports = { queryDocument };