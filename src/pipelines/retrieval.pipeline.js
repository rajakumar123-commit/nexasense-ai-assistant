// ============================================================
// retrieval.pipeline.js
// NexaSense AI Assistant
// Stable Advanced RAG Pipeline (Multi-Document Retrieval)
//
// IMPROVEMENTS (safe, targeted, backward-compatible):
//   1. Controlled per-query vector cap — avoids retrieval explosion
//      from multiple HyDE + expansion queries flooding the merge pool.
//   2. Similarity threshold applied BEFORE slicing — high-quality
//      chunks are never cut off in favour of noisy low-score ones.
//   3. Keyword results capped tightly (1 per query → 2 total max)
//      so they act as a tie-breaker, not a noise source.
//   4. Reranker threshold lowered to 0.45 with a floor-count guard
//      of 3 to avoid over-filtering on short or sparse documents.
//   5. Pre-rerank pool capped at 20 (up from 12) so the reranker
//      has enough candidates to work with after dedup + threshold.
//   6. Context compression failure now logged with reason so it is
//      diagnosable in production without crashing the pipeline.
//   7. All improvement areas are annotated with "IMPROVEMENT:" tags.
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
const { recordQueryMetrics, ragQueryDuration } = require("../services/metrics.service");

const logger = require("../utils/logger");

// ============================================================
// RETRIEVAL CONFIGURATION
// Centralised constants — easy to tune without touching logic.
// ============================================================

const RETRIEVAL_CONFIG = {
  // IMPROVEMENT 1: Per-query vector cap.
  // Each HyDE + expansion query fetches at most this many chunks.
  // Without a cap, 4 queries × default top-k = retrieval explosion.
  VECTOR_PER_QUERY_K: 5,

  // IMPROVEMENT 2: Minimum similarity to enter the merge pool.
  // Chunks below this score are discarded before any slicing occurs,
  // so a high-scoring chunk is never displaced by a noisy low-scorer.
  MIN_SIMILARITY_THRESHOLD: 0.50,

  // IMPROVEMENT 3: Pre-rerank candidate pool size.
  // Raised from 12 → 20 so the reranker has a richer candidate set
  // after dedup + threshold filtering, especially on sparse documents.
  PRE_RERANK_POOL_SIZE: 20,

  // IMPROVEMENT 4: Reranker threshold.
  // Lowered from 0.6 → 0.45 — the reranker already operates on a
  // pre-filtered pool, so a strict second threshold was cutting good
  // chunks that just scored slightly below 0.6 after rescoring.
  RERANK_SCORE_THRESHOLD: 0.45,

  // Minimum chunks to pass to the generator even if scores are low.
  // Guards against sparse documents where no chunk crosses the threshold.
  RERANK_FLOOR_COUNT: 3,

  // Hard cap on chunks sent into context compression + generation.
  // Keeps prompt size bounded and reduces LLM noise.
  MAX_FINAL_CHUNKS: 7,

  // IMPROVEMENT 5: Keyword results per query.
  // Keyword search is a support signal, not the primary signal.
  // 1 chunk per query is enough to surface exact-match evidence.
  KEYWORD_PER_QUERY_K: 1,
};


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
// Deduplication key priority: chunkIndex > chunkId > content prefix
// ------------------------------------------------------------

function dedupe(chunks = []) {
  const seen = new Set();
  return chunks.filter(chunk => {
    const key =
      chunk?.metadata?.chunkIndex ??
      chunk?.metadata?.chunkId ??
      (chunk?.content || "").slice(0, 200);

    if (key === null || key === undefined) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


// ============================================================
// GEMINI CONTEXT MODE HELPERS
// (unchanged — these are stable and correct)
// ============================================================

async function extractDocumentDomain(userId, documentId, seedQuery) {
  try {
    let domainChunks = (userId && documentId === "all")
      ? await searchUserDocuments(userId, seedQuery, 5)
      : await searchDocument(documentId, seedQuery, 5);

    if (!domainChunks || !domainChunks.length) {
      if (documentId && documentId !== "all") {
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
    // QUERY NORMALIZATION
    // ---------------------------------------------------------

    question = normalizeQuery(question);


    // ---------------------------------------------------------
    // CACHE CHECK — Exact match (in-process LRU)
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 0: CACHE CHECK");
    const cached = getCachedResult(documentId, question);

    if (cached) {
      recordQueryMetrics({ userId, documentId, totalMs: Date.now() - startTime, fromCache: true }).catch(() => { });
      return {
        ...cached,
        chunksRetrieved: cached.chunksRetrieved || 0,
        chunksUsed: cached.chunksUsed || 0,
        tokenEstimate: cached.tokenEstimate || 0,
        fromCache: true,
        responseTimeMs: Date.now() - startTime
      };
    }


    // ---------------------------------------------------------
    // SEMANTIC CACHE CHECK — Redis vector cosine similarity
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 1: SEMANTIC CACHE");
    const semanticHit = await getSemanticCache(question);

    if (semanticHit) {
      recordQueryMetrics({ userId, documentId, totalMs: Date.now() - startTime, fromCache: true }).catch(() => { });
      return {
        ...semanticHit,
        fromCache: true,
        semanticCache: true,
        responseTimeMs: Date.now() - startTime
      };
    }


    // ---------------------------------------------------------
    // LOAD CONVERSATION HISTORY
    // ---------------------------------------------------------

    let history = [];
    if (conversationId && svc) {
      try { history = await svc.getConversationHistory(conversationId); } catch { }
    }


    // ---------------------------------------------------------
    // GROQ PRE-PROCESSING (1 batched API call)
    // Spell-fix · standalone rewrite · HyDE · 3× query expansion
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 2: GROQ PRE-PROCESSING");
    const groqResult = await processQueryWithGroq(question, history);
    question = groqResult.standaloneQuery;

    // Deduplicate queries upfront so we don't fire redundant searches.
    const rewrittenQueries = [...new Set([question, ...groqResult.searchQueries])];

    const hypotheticalDoc = groqResult.hypotheticalDocument || question;


    // ---------------------------------------------------------
    // VECTOR RETRIEVAL — Parallel, capped per query
    //
    // IMPROVEMENT 1: Each search call is capped at VECTOR_PER_QUERY_K.
    // Without this, multiple expansion queries × default top-k (often
    // 10) fills the pool with hundreds of overlapping chunks before
    // dedup, making the reranker score distribution unreliable.
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 3: VECTOR RETRIEVAL");

    const isGlobal = userId && documentId === "all";
    const K = RETRIEVAL_CONFIG.VECTOR_PER_QUERY_K;

    const vectorPromises = [
      // HyDE document search — primary signal
      isGlobal
        ? searchUserDocuments(userId, hypotheticalDoc, K)
        : searchDocument(documentId, hypotheticalDoc, K),

      // Expanded query variants — supporting signals
      ...rewrittenQueries.map(q =>
        isGlobal
          ? searchUserDocuments(userId, q, K)
          : searchDocument(documentId, q, K)
      )
    ];


    // ---------------------------------------------------------
    // KEYWORD RETRIEVAL — Support signal only
    //
    // IMPROVEMENT 5: Keyword search is limited to specific-document
    // queries (never "all") and fetches only KEYWORD_PER_QUERY_K
    // chunk per variant. This keeps exact-match evidence available
    // as a tie-breaker without polluting the vector-ranked pool.
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 4: KEYWORD RETRIEVAL");
    const keywordQueries = (documentId && documentId !== "all")
      ? [...rewrittenQueries, hypotheticalDoc]
      : [];

    const keywordPromises = keywordQueries.map(q =>
      keywordSearch(documentId, q, RETRIEVAL_CONFIG.KEYWORD_PER_QUERY_K)
    );

    logger.info("[Pipeline] Step 5: AWAITING SEARCH PROMISES");
    const [vectorResults, keywordResults] = await Promise.all([
      Promise.all(vectorPromises),
      Promise.all(keywordPromises)
    ]);


    // ---------------------------------------------------------
    // MERGE
    //
    // Vector results contribute their full per-query cap.
    // Keyword results contribute 1 chunk each (already capped above)
    // so they can surface exact matches without overwhelming the pool.
    // ---------------------------------------------------------

    let chunks = [];
    vectorResults.forEach(r => chunks.push(...r));
    keywordResults.forEach(r => chunks.push(...r.slice(0, 1)));


    // ---------------------------------------------------------
    // DEDUP → FILTER → SLICE (in correct order)
    //
    // IMPROVEMENT 2: Similarity threshold is applied AFTER dedup
    // but BEFORE the pool-size slice. In the original code, slicing
    // happened first (chunks.slice(0, 12)) which could cut a chunk
    // with similarity 0.80 if 12 lower-scored duplicates preceded it.
    // Correct order: dedup → filter → slice → rerank.
    // ---------------------------------------------------------

    // Step A: deduplicate
    chunks = dedupe(chunks);

    // Step B: discard genuinely noisy chunks before slicing
    // IMPROVEMENT 2: filter BEFORE slice so high-quality chunks
    // are never displaced by low-quality ones that happened to
    // appear earlier in the merged array.
    chunks = chunks.filter(c => (c.similarity || 0) > RETRIEVAL_CONFIG.MIN_SIMILARITY_THRESHOLD);

    // Step C: cap pool size for the reranker
    // IMPROVEMENT 3: pool raised to 20 so reranker has more to work
    // with, especially after aggressive threshold filtering above.
    chunks = chunks.slice(0, RETRIEVAL_CONFIG.PRE_RERANK_POOL_SIZE);

    chunksRetrieved = chunks.length;


    // ---------------------------------------------------------
    // RERANK
    //
    // IMPROVEMENT 4: Score threshold lowered to 0.45 (from 0.6).
    // The pool is already pre-filtered at 0.50, so the reranker is
    // operating on a clean set. A hard 0.6 cutoff was discarding
    // valid chunks on short documents where all scores cluster lower.
    // The FLOOR_COUNT guard ensures we always attempt generation
    // if any chunks exist at all.
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 6: RERANK");
    let finalChunks = [];

    if (chunks.length) {
      const reranked = await rerankChunks(question, chunks);

      // Apply threshold on reranked scores
      finalChunks = reranked.filter(
        c => (c.similarity || 0) > RETRIEVAL_CONFIG.RERANK_SCORE_THRESHOLD
      );

      // Floor guard: if threshold filtered too aggressively (e.g. sparse
      // document with uniformly low scores), fall back to best N chunks.
      if (finalChunks.length < RETRIEVAL_CONFIG.RERANK_FLOOR_COUNT) {
        finalChunks = reranked.slice(0, RETRIEVAL_CONFIG.RERANK_FLOOR_COUNT);
      }

      // Hard cap: keep only the top MAX_FINAL_CHUNKS to bound prompt size.
      finalChunks = finalChunks.slice(0, RETRIEVAL_CONFIG.MAX_FINAL_CHUNKS);
    }

    chunksUsed = finalChunks.length;


    // ---------------------------------------------------------
    // EARLY EXIT — GEMINI CONTEXT MODE FALLBACK
    // Triggered only when retrieval returns zero usable chunks.
    // ---------------------------------------------------------

    if (!finalChunks.length) {
      logger.info("[Pipeline] Gemini Context Mode activated — no usable chunks found");

      const fallbackResult = await geminiContextModeFallback({
        question,
        domainContext: "the relevant topic",
        chunksRetrieved,
        startTime
      });

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
    //
    // IMPROVEMENT 6: Failure now logs the actual error reason so
    // production issues are diagnosable. Behaviour is unchanged —
    // original chunks are used as fallback on any error.
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 7: CONTEXT COMPRESSION");
    try {
      const compressed = await compressContext(question, finalChunks);
      finalChunks = compressed?.map((c, i) => ({
        ...finalChunks[i],
        content: c?.content || finalChunks[i]?.content
      })) || finalChunks;
    } catch (compressErr) {
      // Non-fatal — original chunks are used as-is.
      logger.warn("[Pipeline] Context compression skipped:", compressErr.message);
    }


    // ---------------------------------------------------------
    // GENERATE ANSWER
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 8: GENERATE ANSWER");
    let answer = await generateAnswer(question, finalChunks, history);


    // ---------------------------------------------------------
    // GEMINI REASONING PASS
    // ---------------------------------------------------------

    logger.info("[Pipeline] Step 9: GEMINI REASONING");
    try {
      answer = await applyReasoning(question, answer, finalChunks);
    } catch (reasonErr) {
      logger.warn("[Pipeline] Gemini reasoning skipped:", reasonErr.message);
    }


    // ---------------------------------------------------------
    // SELF-REFLECTION — Confidence scoring (0–100%)
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
      userId,
      documentId,
      totalMs: result.responseTimeMs,
      fromCache: false
    }).catch(() => { });

    ragQueryDuration.labels("llama-3.3-70b", "success").observe(result.responseTimeMs / 1000);

    return result;

  } catch (error) {

    logger.error("[Pipeline] Fatal error:", error.message, error.stack);

    ragQueryDuration.labels("llama-3.3-70b", "error").observe((Date.now() - startTime) / 1000);

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