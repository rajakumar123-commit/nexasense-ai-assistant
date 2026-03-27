// ============================================================
// retrieval.pipeline.js — NexaSense AI V5.0 Ultimate
// Unified Enterprise RAG Pipeline (Category-Aware + Multi-LLM)
// ============================================================

"use strict";

const { searchDocument, searchUserDocuments } = require("../services/vectorSearch.service");
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

// ------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------
const RETRIEVAL_CONFIG = {
  VECTOR_PER_QUERY_K: 6,
  MIN_SIMILARITY_THRESHOLD: 0.45,
  PRE_RERANK_POOL_SIZE: 25,
  RERANK_SCORE_THRESHOLD: 0.40,
  RERANK_FLOOR_COUNT: 3,
  MAX_FINAL_CHUNKS: 8,
  KEYWORD_PER_QUERY_K: 2,
};

let _convSvc = null;
function getConvSvc() {
  if (!_convSvc) {
    try { _convSvc = require("../services/conversation.service"); } catch { _convSvc = null; }
  }
  return _convSvc;
}

function dedupe(chunks = []) {
  const seen = new Set();
  return chunks.filter(chunk => {
    const key = chunk?.metadata?.chunkIndex ?? chunk?.metadata?.chunkId ?? (chunk?.content || "").slice(0, 150);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================
// RESTORED & OPTIMIZED HELPER FUNCTIONS (The "Sub-Brains")
// ============================================================

async function extractDocumentDomain(userId, documentId, seedQuery) {
  try {
    let domainChunks = (userId && documentId === "all")
      ? await searchUserDocuments(userId, seedQuery, 5)
      : await searchDocument(documentId, seedQuery, 5);

    if (!domainChunks?.length && documentId !== "all") {
      domainChunks = await keywordSearch(documentId, seedQuery, 5);
    }
    if (!domainChunks?.length) return null;

    const snippets = domainChunks.slice(0, 5).map(c => (c.content || "").slice(0, 200).trim()).join("\n\n");
    const prompt = `Produce ONE concise sentence describing the subject domain of these excerpts:\n${snippets}\nReturn ONLY the sentence.`;
    return (await askGemini(prompt))?.trim() || null;
  } catch (err) {
    logger.warn("[Pipeline] Domain extraction failed:", err.message);
    return null;
  }
}

async function groqDomainAnswer(question) {
  const Groq = require("groq-sdk");
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: "You are NexaSense. Start with: '⚠️ I couldn't find this in your documents. From my own knowledge:'" },
      { role: "user", content: question }
    ]
  });
  return response?.choices?.[0]?.message?.content || "";
}

async function geminiContextModeFallback({ question, chunksRetrieved, startTime }) {
  const prompt = `You are NexaSense AI. The user's question isn't in their documents. Answer accurately using your general knowledge. Start with a warm note in the user's language about using general knowledge. Question: ${question}`;
  try {
    const answer = await askGemini(prompt);
    return {
      answer: answer || "Question outside scope.",
      sources: [],
      provider: "gemini",
      chunksRetrieved,
      chunksUsed: 0,
      responseTimeMs: Date.now() - startTime
    };
  } catch (e) {
    const backup = await groqDomainAnswer(question);
    return { answer: backup, provider: "groq-fallback", chunksRetrieved, chunksUsed: 0, responseTimeMs: Date.now() - startTime };
  }
}

// ============================================================
// MAIN PIPELINE
// ============================================================

async function runRetrievalPipeline({ userId, documentId, question, conversationId }) {
  const startTime = Date.now();
  const svc = getConvSvc();
  let chunksRetrieved = 0;

  try {
    question = normalizeQuery(question);

    // 1. CACHE CHECK
    const cached = getCachedResult(documentId, question);
    if (cached) return { ...cached, fromCache: true, responseTimeMs: Date.now() - startTime };

    // 2. LOAD HISTORY
    let history = [];
    if (conversationId && svc) { try { history = await svc.getConversationHistory(conversationId); } catch { } }

    // 3. SEMANTIC QUERY REWRITE (Groq)
    logger.info("[Pipeline] Step 2: INTELLIGENT REWRITE");
    const groqResult = await processQueryWithGroq(question, history);
    
    // Inject Category Hints for our V5 Scraper Tags
    let enhancedQueries = [...new Set([groqResult.standaloneQuery, ...groqResult.searchQueries])];
    if (/phone|email|contact|address/i.test(question)) enhancedQueries.push("[Category: CONTACT_INFO]");
    if (/service|offer|price/i.test(question)) enhancedQueries.push("[Category: SERVICE_DESCRIPTION]");

    // 4. HYBRID RETRIEVAL
    const isGlobal = userId && documentId === "all";
    const K = RETRIEVAL_CONFIG.VECTOR_PER_QUERY_K;

    const [vectorRes, keywordRes] = await Promise.all([
      Promise.all(enhancedQueries.map(q => isGlobal ? searchUserDocuments(userId, q, K) : searchDocument(documentId, q, K))),
      Promise.all(enhancedQueries.map(q => keywordSearch(documentId, q, RETRIEVAL_CONFIG.KEYWORD_PER_QUERY_K)))
    ]);

    // 5. MERGE, BOOST, & RERANK
    let chunks = dedupe([...vectorRes.flat(), ...keywordRes.flat()]);
    
    // Category-Aware Boosting (+15% for matching roles)
    chunks = chunks.map(c => {
      let boost = 0;
      if (/contact/i.test(question) && c.content.includes("CONTACT_INFO")) boost = 0.15;
      if (/service/i.test(question) && c.content.includes("SERVICE_DESCRIPTION")) boost = 0.15;
      return { ...c, similarity: (c.similarity || 0) + boost };
    });

    chunks = chunks.filter(c => c.similarity > RETRIEVAL_CONFIG.MIN_SIMILARITY_THRESHOLD);
    chunks.sort((a, b) => b.similarity - a.similarity).slice(0, RETRIEVAL_CONFIG.PRE_RERANK_POOL_SIZE);
    chunksRetrieved = chunks.length;

    let finalChunks = [];
    if (chunks.length) {
      const reranked = await rerankChunks(question, chunks);
      finalChunks = reranked.filter(c => c.similarity > RETRIEVAL_CONFIG.RERANK_SCORE_THRESHOLD);
      if (finalChunks.length < RETRIEVAL_CONFIG.RERANK_FLOOR_COUNT) finalChunks = reranked.slice(0, RETRIEVAL_CONFIG.RERANK_FLOOR_COUNT);
      finalChunks = finalChunks.slice(0, RETRIEVAL_CONFIG.MAX_FINAL_CHUNKS);
    }

    // 6. NO CONTENT FALLBACK (The Two-LLM Pivot)
    if (!finalChunks.length) {
      logger.info("[Pipeline] No usable chunks — Triggering Gemini Fallback");
      return await geminiContextModeFallback({ question, chunksRetrieved, startTime });
    }

    // 7. GENERATE V7 ANSWER
    let answer = await generateAnswer(question, finalChunks, history);
    try { answer = await applyReasoning(question, answer, finalChunks); } catch (e) { }

    const result = {
      answer,
      chunksRetrieved,
      chunksUsed: finalChunks.length,
      sources: finalChunks.map((c, i) => ({
        sourceIndex: i + 1,
        chunkIndex: c?.metadata?.chunkIndex ?? null,
        category: c.content.match(/\[Category: (\w+)\]/)?.[1] || "GENERAL",
        preview: (c?.content || "").slice(0, 150).replace(/\[Category: \w+\]\s*/, "")
      })),
      responseTimeMs: Date.now() - startTime
    };

    // 8. FINAL PERSISTENCE
    if (conversationId && svc) {
      svc.saveMessage(conversationId, "user", question).catch(() => {});
      svc.saveMessage(conversationId, "assistant", answer).catch(() => {});
    }
    storeCachedResult(documentId, question, result);
    recordQueryMetrics({ userId, documentId, totalMs: result.responseTimeMs }).catch(() => {});

    return result;

  } catch (error) {
    logger.error("[Pipeline] Fatal Error:", error.message);
    return { answer: "System error. Please try again.", sources: [], responseTimeMs: Date.now() - startTime };
  }
}

module.exports = { runRetrievalPipeline };