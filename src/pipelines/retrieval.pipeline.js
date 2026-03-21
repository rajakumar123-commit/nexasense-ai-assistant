// ============================================================
// retrieval.pipeline.js
// NexaSense AI Assistant
// Stable Advanced RAG Pipeline (Multi-Document Retrieval)
// FIX: Replaced all console.log/warn/error with logger
// ============================================================

const {
  searchDocument,
  searchUserDocuments
} = require("../services/vectorSearch.service");

const { keywordSearch }                  = require("../services/keywordSearch.service");
const { rerankChunks }                   = require("../services/reranker.service");
const { rewriteQuery }                   = require("../services/queryRewrite.service");
const { generateAnswer, estimateTokens } = require("../services/llm.service");

const { hydeSearchVector }    = require("../services/hyde.service");
const { compressContext }     = require("../services/contextCompression.service");
const { reflectAnswer }       = require("../services/selfReflection.service");

const { applyReasoning } = require("../services/geminiReasoning.service");
const { askGemini }      = require("../services/gemini.service");

const { getCachedResult, storeCachedResult } = require("../cache/queryCache");
const { getSemanticCache, storeSemanticCache } = require("../cache/semanticCache");

const { normalizeQuery }    = require("../services/queryNormalizer.service");
const { correctSpelling }   = require("../services/spellCorrection.service");
const { expandQuery }       = require("../services/queryExpansion.service");
const { recordQueryMetrics} = require("../services/metrics.service");

const logger = require("../utils/logger");

let _convSvc = null;

function getConvSvc() {
  if (!_convSvc) {
    try {
      _convSvc = require("../services/conversation.service");
    } catch {
      _convSvc = null;
    }
  }
  return _convSvc;
}


// ------------------------------------------------------------
// Remove duplicate chunks
// ------------------------------------------------------------

function dedupe(chunks = []) {
  const seen = new Set();
  return chunks.filter(chunk => {
    const key =
      chunk?.metadata?.chunkIndex ??
      chunk?.metadata?.chunkId ??
      (chunk?.content || "").slice(0, 80);

    if (key === null || key === undefined) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


// ============================================================
// GEMINI CONTEXT MODE HELPERS
// ============================================================

async function extractDocumentDomain(userId, documentId, seedQuery) {
  try {
    let domainChunks = userId
      ? await searchUserDocuments(userId, seedQuery, 5)
      : await searchDocument(documentId, seedQuery, 5);

    if (!domainChunks || !domainChunks.length) {
      domainChunks = await keywordSearch(documentId, seedQuery, 5);
    }

    if (!domainChunks || !domainChunks.length) return null;

    const snippets = domainChunks
      .slice(0, 5)
      .map(c => (c.content || "").slice(0, 200).trim())
      .filter(Boolean)
      .join("\n\n");

    const prompt = `
You are a domain classifier for a document assistant.

Below are excerpt snippets from a set of uploaded documents.
Produce ONE concise sentence (max 40 words) that describes the subject domain
covered by these documents.

Examples of good domain descriptions:
- "Machine learning and deep learning concepts including neural networks, training, optimization, and model evaluation."
- "Corporate financial statements, accounting practices, and audit compliance for FY 2023."

Document Excerpts:
${snippets}

Return ONLY the domain description sentence. No preamble.
`.trim();

    const domain = await askGemini(prompt);
    return (domain || "").trim() || null;

  } catch (err) {
    logger.warn("[Pipeline] extractDocumentDomain failed:", err.message);
    return null;
  }
}


async function groqDomainAnswer(question, domainContext) {
  const Groq   = require("groq-sdk");
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const response = await client.chat.completions.create({
    model:       "llama-3.3-70b-versatile",
    max_tokens:  1000,
    temperature: 0.2,
    messages: [
      {
        role:    "system",
        content: `You are a document assistant. Answer questions ONLY if they relate to this domain:\n\n${domainContext}\n\nIf the question is unrelated, respond exactly:\n"This question is outside the scope of the uploaded documents."\n\nDo not use knowledge outside this domain.`
      },
      { role: "user", content: question }
    ]
  });

  return response?.choices?.[0]?.message?.content?.trim() || "";
}


async function isQueryInDomain(question, domainContext) {
  const prompt = `
Is this question related to the following domain?

DOMAIN:
${domainContext}

QUESTION:
${question}

Answer ONLY with:
YES
or
NO
`.trim();

  try {
    const response = await askGemini(prompt);
    return (response || "").trim().toUpperCase().startsWith("YES");
  } catch (geminiErr) {
    logger.warn("[Pipeline] isQueryInDomain Gemini failed:", geminiErr.message);
  }

  try {
    logger.info("[Pipeline] isQueryInDomain falling back to Groq");
    const Groq   = require("groq-sdk");
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const response = await client.chat.completions.create({
      model:       "llama-3.3-70b-versatile",
      max_tokens:  5,
      temperature: 0,
      messages:    [{ role: "user", content: prompt }]
    });
    return (response?.choices?.[0]?.message?.content || "").trim().toUpperCase().startsWith("YES");
  } catch (groqErr) {
    logger.warn("[Pipeline] isQueryInDomain Groq also failed:", groqErr.message);
    return false;
  }
}


async function geminiContextModeFallback({ question, domainContext, chunksRetrieved, startTime }) {
  const prompt = `
You are answering questions about the following document domain:

${domainContext}

Answer the question ONLY if it is clearly related to this domain.
Use your knowledge of this subject area to give a helpful, accurate answer.

If the question is unrelated to the domain, respond EXACTLY with:
"This question is outside the scope of the uploaded documents."

QUESTION:
${question}
`.trim();

  try {
    const answer = await askGemini(prompt);
    return {
      answer:          (answer || "").trim() || "This question is outside the scope of the uploaded documents.",
      sources:         [],
      provider:        "gemini",
      chunksRetrieved,
      chunksUsed:      0,
      tokenEstimate:   estimateTokens(answer || ""),
      fromCache:       false,
      responseTimeMs:  Date.now() - startTime
    };
  } catch (geminiErr) {
    logger.warn("[Pipeline] Gemini context mode failed:", geminiErr.message);
    logger.info("[Pipeline] Falling back to Groq for context mode answer");
  }

  try {
    const answer = await groqDomainAnswer(question, domainContext);
    return {
      answer:          answer || "This question is outside the scope of the uploaded documents.",
      sources:         [],
      provider:        "groq-fallback",
      chunksRetrieved,
      chunksUsed:      0,
      tokenEstimate:   estimateTokens(answer || ""),
      fromCache:       false,
      responseTimeMs:  Date.now() - startTime
    };
  } catch (groqErr) {
    logger.error("[Pipeline] Groq context mode fallback also failed:", groqErr.message);
    return {
      answer:          "This information is not available in the uploaded document.",
      sources:         [],
      provider:        "none",
      chunksRetrieved,
      chunksUsed:      0,
      tokenEstimate:   0,
      fromCache:       false,
      responseTimeMs:  Date.now() - startTime
    };
  }
}


// ============================================================
// MAIN PIPELINE
// ============================================================

async function runRetrievalPipeline({ userId, documentId, question, conversationId }) {

  const startTime = Date.now();
  const svc       = getConvSvc();

  let chunksRetrieved = 0;
  let chunksUsed      = 0;

  try {

    // ---------------------------------------------------------
    // QUERY UNDERSTANDING
    // ---------------------------------------------------------

    question = normalizeQuery(question);
    question = await correctSpelling(question);

    const expandedQueries = await expandQuery(question);


    // ---------------------------------------------------------
    // CACHE CHECK
    // ---------------------------------------------------------

    const cached = getCachedResult(documentId, question);

    if (cached) {
      recordQueryMetrics({ userId, documentId, totalMs: Date.now() - startTime, fromCache: true }).catch(() => {});
      return { ...cached, chunksRetrieved: cached.chunksRetrieved || 0, chunksUsed: cached.chunksUsed || 0, tokenEstimate: cached.tokenEstimate || 0, fromCache: true, responseTimeMs: Date.now() - startTime };
    }


    // ---------------------------------------------------------
    // SEMANTIC CACHE CHECK
    // ---------------------------------------------------------

    const semanticHit = await getSemanticCache(question);

    if (semanticHit) {
      recordQueryMetrics({ userId, documentId, totalMs: Date.now() - startTime, fromCache: true }).catch(() => {});
      return { ...semanticHit, fromCache: true, semanticCache: true, responseTimeMs: Date.now() - startTime };
    }


    // ---------------------------------------------------------
    // LOAD CONVERSATION HISTORY
    // ---------------------------------------------------------

    let history = [];
    if (conversationId && svc) {
      try { history = await svc.getConversationHistory(conversationId); } catch {}
    }


    // ---------------------------------------------------------
    // QUERY REWRITE
    // ---------------------------------------------------------

    let rewrittenQueries = await rewriteQuery(question, history);
    if (!Array.isArray(rewrittenQueries)) rewrittenQueries = [rewrittenQueries];
    rewrittenQueries = [...new Set([...expandedQueries, ...rewrittenQueries])];


    // ---------------------------------------------------------
    // HYDE GENERATION
    // ---------------------------------------------------------

    let hypotheticalDoc = rewrittenQueries[0];

    try {
      const hyde = await hydeSearchVector(rewrittenQueries[0]);
      hypotheticalDoc = hyde?.hypotheticalDoc || rewrittenQueries[0];
    } catch {}


    // ---------------------------------------------------------
    // VECTOR RETRIEVAL (MULTI-DOCUMENT)
    // ---------------------------------------------------------

    const vectorPromises = [
      userId ? searchUserDocuments(userId, hypotheticalDoc) : searchDocument(documentId, hypotheticalDoc),
      ...rewrittenQueries.map(q =>
        userId ? searchUserDocuments(userId, q) : searchDocument(documentId, q)
      )
    ];


    // ---------------------------------------------------------
    // KEYWORD RETRIEVAL
    // ---------------------------------------------------------

    const keywordQueries  = [...rewrittenQueries, hypotheticalDoc];
    const keywordPromises = keywordQueries.map(q => keywordSearch(documentId, q));


    const [vectorResults, keywordResults] = await Promise.all([
      Promise.all(vectorPromises),
      Promise.all(keywordPromises)
    ]);

    let chunks = [];
    vectorResults.forEach(r => chunks.push(...r.slice(0, 3)));
    keywordResults.forEach(r => chunks.push(...r.slice(0, 2)));


    // ---------------------------------------------------------
    // DEDUPE
    // ---------------------------------------------------------

    chunks = dedupe(chunks);
    chunks = chunks.slice(0, 20);
    chunksRetrieved = chunks.length;


    // ---------------------------------------------------------
    // RERANK
    // ---------------------------------------------------------

    let finalChunks = [];
    if (chunks.length) {
      const reranked = await rerankChunks(question, chunks);
      finalChunks = reranked.slice(0, 7);
    }

    chunksUsed = finalChunks.length;


    // ---------------------------------------------------------
    // EARLY EXIT — GEMINI CONTEXT MODE FALLBACK
    // Triggered when retrieval returns zero usable chunks.
    // ---------------------------------------------------------

    if (!finalChunks.length) {

      logger.info("[Pipeline] Gemini Context Mode activated — no usable chunks found");

      const domainContext = await extractDocumentDomain(userId, documentId, question);

      if (!domainContext) {
        logger.warn("[Pipeline] Domain extraction failed — using hard fallback");
        return {
          answer: "This information is not available in the uploaded document.",
          sources: [], confidence: 0, chunksRetrieved, chunksUsed,
          tokenEstimate: 0, fromCache: false, responseTimeMs: Date.now() - startTime
        };
      }

      const inDomain = await isQueryInDomain(question, domainContext);

      if (!inDomain) {
        logger.info("[Pipeline] Query rejected — outside document domain");
        return {
          answer: "This question is outside the scope of the uploaded documents.",
          sources: [], provider: "gemini", chunksRetrieved, chunksUsed: 0,
          tokenEstimate: 0, fromCache: false, responseTimeMs: Date.now() - startTime
        };
      }

      const fallbackResult = await geminiContextModeFallback({ question, domainContext, chunksRetrieved, startTime });

      if (conversationId && svc) {
        Promise.all([
          svc.saveMessage(conversationId, "user", question),
          svc.saveMessage(conversationId, "assistant", fallbackResult.answer)
        ]).catch(() => {});
      }

      return fallbackResult;

    }


    // ---------------------------------------------------------
    // CONTEXT COMPRESSION
    // ---------------------------------------------------------

    try {
      const compressed = await compressContext(question, finalChunks);
      finalChunks = compressed?.map((c, i) => ({
        ...finalChunks[i],
        content: c?.content || finalChunks[i]?.content
      })) || finalChunks;
    } catch {}


    // ---------------------------------------------------------
    // GENERATE ANSWER
    // ---------------------------------------------------------

    let answer = await generateAnswer(question, finalChunks, history);


    // ---------------------------------------------------------
    // GEMINI REASONING
    // ---------------------------------------------------------

    try {
      answer = await applyReasoning(question, answer, finalChunks);
    } catch {
      logger.warn("[Pipeline] Gemini reasoning skipped");
    }


    // ---------------------------------------------------------
    // SELF REFLECTION
    // ---------------------------------------------------------

    let confidence = null;
    try {
      const reflection = await reflectAnswer(question, answer, finalChunks);
      confidence = reflection?.reflection?.confidence ?? null;
    } catch {}


    // ---------------------------------------------------------
    // BUILD RESULT
    // ---------------------------------------------------------

    const result = {
      answer,
      confidence,
      chunksRetrieved,
      chunksUsed,
      sources: finalChunks.map((c, i) => ({
        sourceIndex: i + 1,
        chunkIndex:  c?.metadata?.chunkIndex ?? null,
        pageNumber:  c?.metadata?.pageNumber  ?? null,
        similarity:  c?.similarity             ?? null,
        preview:     (c?.content || "").slice(0, 150)
      })),
      fromCache:     false,
      responseTimeMs: Date.now() - startTime,
      tokenEstimate:  estimateTokens(answer || "")
    };


    // ---------------------------------------------------------
    // SAVE CONVERSATION
    // ---------------------------------------------------------

    if (conversationId && svc) {
      Promise.all([
        svc.saveMessage(conversationId, "user",      question),
        svc.saveMessage(conversationId, "assistant", answer)
      ]).catch(() => {});
    }


    // ---------------------------------------------------------
    // CACHE RESULT
    // ---------------------------------------------------------

    storeCachedResult(documentId, question, result);
    storeSemanticCache(question, result).catch(() => {});


    // ---------------------------------------------------------
    // RECORD METRICS
    // ---------------------------------------------------------

    recordQueryMetrics({
      userId, documentId,
      totalMs: result.responseTimeMs,
      fromCache: false
    }).catch(() => {});

    return result;

  } catch (error) {

    logger.error("[Pipeline] Fatal error:", error.message, error.stack);

    return {
      answer:         "An unexpected error occurred while processing your question.",
      sources:        [],
      confidence:     0,
      chunksRetrieved,
      chunksUsed,
      tokenEstimate:  0,
      fromCache:      false,
      responseTimeMs: Date.now() - startTime
    };

  }

}


module.exports = { runRetrievalPipeline };