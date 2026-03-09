const { searchDocument } = require("../services/vectorSearch.service");
const { keywordSearch } = require("../services/keywordSearch.service");
const { rerankChunks } = require("../services/reranker.service");
const { rewriteQuery } = require("../services/queryRewrite.service");
const { generateAnswer, estimateTokens } = require("../services/llm.service");
const { getCachedResult, storeCachedResult } = require("../cache/queryCache");

// lazy load conversation service
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

// remove duplicate chunks
function dedupe(chunks) {

  const seen = new Set();

  return chunks.filter(chunk => {

    const key = chunk.metadata?.chunkIndex ?? chunk.content.slice(0, 40);

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}

async function runRetrievalPipeline({ documentId, question, conversationId }) {

  const startTime = Date.now();
  const svc = getConvSvc();

  try {

    // 1️⃣ CACHE CHECK
    const cached = getCachedResult(documentId, question);

    if (cached) {
      console.log("[Pipeline] Cache HIT");

      return {
        ...cached,
        fromCache: true,
        responseTimeMs: Date.now() - startTime
      };
    }

    console.log("[Pipeline] Starting RAG");

    // 2️⃣ LOAD HISTORY
    let history = [];

    if (conversationId && svc) {

      try {

        history = await svc.getConversationHistory(conversationId);

        console.log(`[Pipeline] Loaded ${history.length} history messages`);

      } catch (e) {

        console.warn("[Pipeline] History load skipped");

      }
    }

    // 3️⃣ VECTOR SEARCH
   const rewrittenQuery = await rewriteQuery(question, history);

console.log("[Pipeline] Query:", question);
console.log("[Pipeline] Rewritten:", rewrittenQuery);

const vectorChunks = await searchDocument(documentId, rewrittenQuery);

    // 4️⃣ KEYWORD SEARCH
    const keywordChunks = await keywordSearch(documentId, rewrittenQuery);

    let chunks = [...vectorChunks, ...keywordChunks];

    // remove duplicates
    chunks = dedupe(chunks);

    // limit candidates before reranking
    chunks = chunks.slice(0, 15);

    console.log(`[Pipeline] Retrieved ${chunks.length} chunks`);

    // 5️⃣ RERANK CHUNKS
    const reranked = await rerankChunks(question, chunks);

    const finalChunks = reranked.slice(0, 5);

    console.log(`[Pipeline] Using ${finalChunks.length} chunks`);

    // 6️⃣ GENERATE ANSWER
    const answer = await generateAnswer(question, finalChunks, history);

    const result = {

      answer,

      sources: finalChunks.map((c, i) => ({
        sourceIndex: i + 1,
        chunkIndex: c.metadata?.chunkIndex ?? null,
        pageNumber: c.metadata?.pageNumber ?? null,
        similarity: c.similarity ?? null,
        preview: c.content.slice(0, 150)
      })),

      fromCache: false,

      responseTimeMs: Date.now() - startTime,

      tokenEstimate: estimateTokens(answer)
    };

    // 7️⃣ SAVE HISTORY
    if (conversationId && svc) {

      Promise.all([
        svc.saveMessage(conversationId, "user", question),
        svc.saveMessage(conversationId, "assistant", answer)
      ]).catch(() => {});
    }

    // 8️⃣ CACHE RESULT
    storeCachedResult(documentId, question, result);

    console.log(`[Pipeline] Done in ${result.responseTimeMs}ms`);

    return result;

  } catch (error) {

    console.error("[Pipeline] Fatal error:", error.message);

    return {
      answer: "An unexpected error occurred while processing your question.",
      sources: [],
      fromCache: false,
      responseTimeMs: Date.now() - startTime
    };
  }
}

module.exports = { runRetrievalPipeline };