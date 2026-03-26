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

const { keywordSearch } = require("../services/keywordSearch.service");
const { rerankChunks } = require("../services/reranker.service");
const { processQueryWithGroq } = require("../services/queryRewrite.service");
const { generateAnswer, estimateTokens } = require("../services/llm.service");

const { compressContext } = require("../services/contextCompression.service");
const { reflectAnswer } = require("../services/selfReflection.service");

const { applyReasoning } = require("../services/geminiReasoning.service");
const { askGemini } = require("../services/gemini.service");

const { getCachedResult, storeCachedResult } = require("../cache/queryCache");
const { getSemanticCache, storeSemanticCache } = require("../cache/semanticCache");

const { normalizeQuery } = require("../services/queryNormalizer.service");
const { recordQueryMetrics } = require("../services/metrics.service");

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
      // Only run keyword fallback when we have a specific document.
      // In multi-doc (userId) mode documentId may be undefined.
      if (documentId) {
        domainChunks = await keywordSearch(documentId, seedQuery, 5);
      }
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
  const Groq = require("groq-sdk");
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1000,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You are a helpful and intelligent AI assistant named NexaSense.
The user's question is not directly covered by the uploaded document.

PRIORITY TASK: Use your vast general world knowledge to provide a highly accurate and helpful answer to the user's question.
IMPORTANT: Start your response with a warm personal note (in the SAME language as the question), for example:
"⚠️ I couldn't find this in your uploaded document. The following answer comes from my own knowledge — please verify if needed."
Then provide the full answer.

CRITICAL MULTILINGUAL RULE: Always match the language of the User's question unless they ask otherwise.`
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
    const Groq = require("groq-sdk");
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 5,
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });
    return (response?.choices?.[0]?.message?.content || "").trim().toUpperCase().startsWith("YES");
  } catch (groqErr) {
    logger.warn("[Pipeline] isQueryInDomain Groq also failed:", groqErr.message);
    return false;
  }
}


async function geminiContextModeFallback({ question, domainContext, chunksRetrieved, startTime }) {
  const prompt = `
You are a helpful and intelligent AI assistant named NexaSense.
The user's question does not match any specific content from their uploaded documents.

PRIORITY TASK: Provide a highly accurate, helpful, and detailed answer using your vast general world knowledge.
IMPORTANT: Start your response with a warm personal note (in the SAME language as the question), for example:
"⚠️ I couldn't find this specific information in your uploaded document. The following answer comes from my own knowledge — please verify if needed."
Then provide the full, detailed answer.
CRITICAL MULTILINGUAL RULE: By default, you MUST write your entire response in the EXACT same language as the Question below. HOWEVER, if the user explicitly asks you to reply in a specific language (e.g., "answer in English", or "marathi me batao"), you MUST prioritize their request and reply in that specific language.

QUESTION:
${question}
`.trim();

  try {
    const answer = await askGemini(prompt);
    return {
      answer: (answer || "").trim() || "This question is outside the scope of the uploaded documents.",
      sources: [],
      provider: "gemini",
      chunksRetrieved,
      chunksUsed: 0,
      tokenEstimate: estimateTokens(answer || ""),
      fromCache: false,
      responseTimeMs: Date.now() - startTime
    };
  } catch (geminiErr) {
    logger.warn("[Pipeline] Gemini context mode failed:", geminiErr.message);
    logger.info("[Pipeline] Falling back to Groq for context mode answer");
  }

  try {
    const answer = await groqDomainAnswer(question, domainContext);
    return {
      answer: answer || "I was unable to generate a helpful answer. Please try rephrasing your question.",
      sources: [],
      provider: "groq-fallback",
      chunksRetrieved,
      chunksUsed: 0,
      tokenEstimate: estimateTokens(answer || ""),
      fromCache: false,
      responseTimeMs: Date.now() - startTime
    };
  } catch (groqErr) {
    logger.error("[Pipeline] Groq context mode fallback also failed:", groqErr.message);
    return {
      answer: "This information is not available in the uploaded document.",
      sources: [],
      provider: "none",
      chunksRetrieved,
      chunksUsed: 0,
      tokenEstimate: 0,
      fromCache: false,
      responseTimeMs: Date.now() - startTime
    };
  }
}


// ============================================================
// MAIN PIPELINE
// ============================================================

async function runRetrievalPipeline({ userId, documentId, question, conversationId }) {

  const startTime = Date.now();
  const svc = getConvSvc();

  let chunksRetrieved = 0;
  let chunksUsed = 0;

  try {

    // ---------------------------------------------------------
    // QUERY UNDERSTANDING (Basic Normalization)
    // ---------------------------------------------------------

    question = normalizeQuery(question);


    // ---------------------------------------------------------
    // CACHE CHECK
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 0: CACHE CHECK");
    const cached = getCachedResult(documentId, question);

    if (cached) {
      recordQueryMetrics({ userId, documentId, totalMs: Date.now() - startTime, fromCache: true }).catch(() => { });
      return { ...cached, chunksRetrieved: cached.chunksRetrieved || 0, chunksUsed: cached.chunksUsed || 0, tokenEstimate: cached.tokenEstimate || 0, fromCache: true, responseTimeMs: Date.now() - startTime };
    }


    // ---------------------------------------------------------
    // SEMANTIC CACHE CHECK
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 1: SEMANTIC CACHE");
    const semanticHit = await getSemanticCache(question);

    if (semanticHit) {
      recordQueryMetrics({ userId, documentId, totalMs: Date.now() - startTime, fromCache: true }).catch(() => { });
      return { ...semanticHit, fromCache: true, semanticCache: true, responseTimeMs: Date.now() - startTime };
    }


    // ---------------------------------------------------------
    // LOAD CONVERSATION HISTORY
    // ---------------------------------------------------------

    let history = [];
    if (conversationId && svc) {
      try { history = await svc.getConversationHistory(conversationId); } catch { }
    }


    // ---------------------------------------------------------
    // NODE 1: GROQ PRE-PROCESSING (1 API Call)
    // Handles Spelling, History Resolution, and Expansion
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 2: GROQ PRE-PROCESSING");
    const groqResult = await processQueryWithGroq(question, history);
    question = groqResult.standaloneQuery;
    const rewrittenQueries = [...new Set([question, ...groqResult.searchQueries])];


    // ---------------------------------------------------------
    // HYDE GENERATION
    // Generated directly by Groq in Node 1 to save an API call
    // ---------------------------------------------------------

    let hypotheticalDoc = groqResult.hypotheticalDocument || question;


    // ---------------------------------------------------------
    // VECTOR RETRIEVAL (MULTI-DOCUMENT)
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 3: VECTOR RETRIEVAL");
    const vectorPromises = [
      userId ? searchUserDocuments(userId, hypotheticalDoc) : searchDocument(documentId, hypotheticalDoc),
      ...rewrittenQueries.map(q =>
        userId ? searchUserDocuments(userId, q) : searchDocument(documentId, q)
      )
    ];


    // ---------------------------------------------------------
    // KEYWORD RETRIEVAL
    // Only run keyword search when we have a specific documentId.
    // In multi-doc (userId) mode the documentId may be undefined,
    // so keywordSearch would query with WHERE document_id = undefined
    // and always return []. Skip it in that case.
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 4: KEYWORD RETRIEVAL");
    const keywordQueries = documentId ? [...rewrittenQueries, hypotheticalDoc] : [];
    const keywordPromises = keywordQueries.map(q => keywordSearch(documentId, q));

    logger.info("[Pipeline] Step 5: AWAITING SEARCH PROMISES");
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

    logger.info("[Pipeline] Step 6: RERANK");
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

      logger.info("[Pipeline] Gemini Context Mode activated — retrieving general document answer");

      // Go strictly to the final Gemini Fallback (bypassing 2 redundant context checks)
      const fallbackResult = await geminiContextModeFallback({ question, domainContext: "the relevant topic", chunksRetrieved, startTime });

      if (conversationId && svc) {
        Promise.all([
          svc.saveMessage(conversationId, "user", question),
          svc.saveMessage(conversationId, "assistant", fallbackResult.answer)
        ]).catch(() => { });
      }

      return fallbackResult;

    }


    // ---------------------------------------------------------
    // CONTEXT COMPRESSION
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 7: CONTEXT COMPRESSION");
    try {
      const compressed = await compressContext(question, finalChunks);
      finalChunks = compressed?.map((c, i) => ({
        ...finalChunks[i],
        content: c?.content || finalChunks[i]?.content
      })) || finalChunks;
    } catch { }


    // ---------------------------------------------------------
    // GENERATE ANSWER
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 8: GENERATE ANSWER");
    let answer = await generateAnswer(question, finalChunks, history);


    // ---------------------------------------------------------
    // GEMINI REASONING
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 9: GEMINI REASONING");
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
    } catch { }


    // ---------------------------------------------------------
    // BUILD RESULT
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 10: BUILD RESULT");
    const result = {
      answer,
      confidence,
      chunksRetrieved,
      chunksUsed,
      sources: finalChunks.map((c, i) => ({
        sourceIndex: i + 1,
        chunkIndex: c?.metadata?.chunkIndex ?? null,
        pageNumber: c?.metadata?.pageNumber ?? null,
        similarity: c?.similarity ?? null,
        preview: (c?.content || "").slice(0, 150)
      })),
      pipeline: {
        rewrite: question !== groqResult.standaloneQuery ? groqResult.standaloneQuery : null,
        vectorResults: vectorResults.flat().slice(0, 5).map(c => ({ chunk: c.content, score: c?.similarity })),
        keywordResults: keywordResults.flat().slice(0, 5).map(c => ({ chunk: c.content, score: c?.similarity })),
        reranked: finalChunks.map(c => ({ chunk: c.content, score: c?.similarity })),
        contextChunks: finalChunks.map(c => c.content)
      },
      fromCache: false,
      responseTimeMs: Date.now() - startTime,
      tokenEstimate: estimateTokens(answer || "")
    };


    // ---------------------------------------------------------
    // SAVE CONVERSATION
    // ---------------------------------------------------------

    if (conversationId && svc) {
      Promise.all([
        svc.saveMessage(conversationId, "user", question),
        svc.saveMessage(conversationId, "assistant", answer)
      ]).catch(() => { });
    }


    // ---------------------------------------------------------
    // CACHE RESULT
    // ---------------------------------------------------------

    storeCachedResult(documentId, question, result);
    storeSemanticCache(question, result).catch(() => { });


    // ---------------------------------------------------------
    // RECORD METRICS
    // ---------------------------------------------------------

    recordQueryMetrics({
      userId, documentId,
      totalMs: result.responseTimeMs,
      fromCache: false
    }).catch(() => { });

    return result;

  } catch (error) {

    logger.error("[Pipeline] Fatal error:", error.message, error.stack);

    return {
      answer: "An unexpected error occurred while processing your question.",
      sources: [],
      confidence: 0,
      chunksRetrieved,
      chunksUsed,
      tokenEstimate: 0,
      fromCache: false,
      responseTimeMs: Date.now() - startTime
    };

  }

}


module.exports = { runRetrievalPipeline };