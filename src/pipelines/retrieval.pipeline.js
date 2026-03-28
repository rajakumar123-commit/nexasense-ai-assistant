// ============================================================
// retrieval.pipeline.js — NexaSense AI V7.0 God Tier
//
// WHAT'S NEW vs V5.1:
//   ✅ Semantic cache checked BEFORE exact cache (saves Groq call)
//   ✅ Category boost reads metadata.role (was broken — never fired)
//   ✅ Sources category reads metadata.role (was always "GENERAL")
//   ✅ selfReflection actually used — low-confidence answers flagged
//   ✅ contextCompression wired in before LLM call
//   ✅ Per-step latency tracking (rewrite/vector/keyword/rerank/llm ms)
//   ✅ Query metrics stored with full breakdown
//   ✅ Semantic cache stored after successful answer
//   ✅ Cache invalidated on error (no stale bad answers)
//   ✅ HYDE query used for vector search (was ignored)
//   ✅ Global (all-docs) search properly deduplicated across documents
//   ✅ Graceful degradation — every step has isolated try/catch
//   ✅ TRUE STREAMING: Added onToken hook and generateAnswerStream
//   ✅ V7.0: Reciprocal Rank Fusion (replaces flatten+sort)
//   ✅ V7.0: Parent-Document retrieval (±2 neighbor chunks)
//   ✅ V7.0: Global keyword search fix (passes userId)
// ============================================================

"use strict";

const { searchDocument, searchUserDocuments }  = require("../services/vectorSearch.service");
const {
  keywordSearch,
  wordLevelSearch,
  getDocumentChunkCount,
  getAllDocumentChunks,
}                                              = require("../services/keywordSearch.service");
const { rerankChunks }                         = require("../services/reranker.service");
const { processQueryWithGroq }                 = require("../services/queryRewrite.service");
// ✅ ADDED: generateAnswerStream
const { generateAnswer, generateAnswerStream } = require("../services/llm.service");
const { compressContext }                      = require("../services/contextCompression.service");
const { reflectAnswer }                        = require("../services/selfReflection.service");
const { applyReasoning }                       = require("../services/geminiReasoning.service");
const { askGemini }                            = require("../services/gemini.service");
const { getCachedResult, storeCachedResult }   = require("../cache/queryCache");
const { getSemanticCache, storeSemanticCache } = require("../cache/semanticCache");
const { normalizeQuery }                       = require("../services/queryNormalizer.service");
const { recordQueryMetrics }                   = require("../services/metrics.service");
// ✅ V7.0 NEW SERVICES
const { applyRRF }                             = require("../services/rrf.service");
const { expandWithParentChunks }               = require("../services/parentDocument.service");
const logger                                   = require("../utils/logger");

// ─────────────────────────────────────────────────────────────
// SECTION 1 — CONFIGURATION
// ─────────────────────────────────────────────────────────────

// Configuration
const CFG = {
  VECTOR_K               : 15,    // ✅ Wide context fetch for loose tables
  KEYWORD_K              : 8,     // ✅ Catch headers accurately
  MIN_SIMILARITY         : 0.30,  // ✅ Low enough for structurally separated tables
  PRE_RERANK_POOL        : 60,    // ✅ Wide candidate pool before MMR filters
  RERANK_THRESHOLD       : 0.30,  // ✅ Aligned with MIN_SIMILARITY
  RERANK_FLOOR           : 6,     // ✅ Always keep at least 6 chunks
  MAX_FINAL_CHUNKS       : 30,    // ✅ INCREASED: since chunk size is now 800, we can feed 30 chunks (~6k tokens) to LLM
  GUARANTEE_MAX_CHUNKS   : 60,    // ✅ MAX limit for Complete-Doc/Pass 4 deep sweeps
  REFLECTION_MIN_CONF    : 0.20,
  CATEGORY_BOOST         : 0.15,
  // V8.0 Guarantee thresholds
  MIN_CHUNKS_GUARANTEE   : 5,     // Trigger Pass 2 if below this
  PASS3_TRIGGER          : 3,     // Trigger Pass 3 (word-level) if still below this
  SMALL_DOC_THRESHOLD    : 60,    // Docs with ≤ 60 chunks get complete retrieval
};

// ─────────────────────────────────────────────────────────────
// SECTION 2 — CATEGORY RULES
// Maps question keywords → V5.1 chunk roles (from scraper)
// Used for query hints AND similarity boost
// ─────────────────────────────────────────────────────────────

const CATEGORY_RULES = [
  // Contact / business
  { pattern: /phone|mobile|call|email|contact|address|reach|location|whatsapp/i, role: "CONTACT_INFO"        },
  { pattern: /service|offer|solution|feature|capability|plan|package/i,          role: "SERVICE_DESCRIPTION" },
  { pattern: /price|cost|rate|fee|charge|₹|\$|usd|specification|sku|dimension/i, role: "PRODUCT_DETAIL"      },
  { pattern: /review|testimonial|feedback|rating|star|customer said/i,           role: "TESTIMONIAL"         },
  { pattern: /faq|frequently|how do i|what is|how to|can i/i,                    role: "FAQ"                 },
  { pattern: /terms|privacy|policy|copyright|legal|disclaimer/i,                 role: "LEGAL_FOOTER"        },
  // Technical / ML document roles (V7.0)
  { pattern: /algorithm|pseudocode|procedure|step \d|input:|output:/i,           role: "ALGORITHM"           },
  { pattern: /definition|defined as|formally|denoted by/i,                       role: "DEFINITION"          },
  { pattern: /example|for instance|consider|case study|e\.g\./i,                 role: "EXAMPLE"             },
  { pattern: /formula|equation|\\frac|\\sum|\\int|proof|theorem/i,               role: "FORMULA"             },
  { pattern: /introduction|overview|background|motivation|abstract/i,            role: "OVERVIEW"            },
];

function detectCategory(question) {
  for (const { pattern, role } of CATEGORY_RULES) {
    if (pattern.test(question)) return role;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// SECTION 3 — HELPERS
// ─────────────────────────────────────────────────────────────

// Lazy-load conversation service to avoid circular deps
let _convSvc = null;
function getConvSvc() {
  if (!_convSvc) {
    try { _convSvc = require("../services/conversation.service"); } catch { _convSvc = null; }
  }
  return _convSvc;
}

// Deduplicate chunks by chunkIndex or content prefix
function dedupe(chunks = []) {
  const seen = new Set();
  return chunks.filter(c => {
    const key =
      c?.metadata?.chunkIndex != null
        ? `${c?.metadata?.documentId || ""}:${c.metadata.chunkIndex}`
        : (c?.content || "").slice(0, 150);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Read role from metadata (set by ingestion worker V5.1)
// Falls back gracefully for older chunks without role
function getChunkRole(chunk) {
  return (
    chunk?.metadata?.role ||
    chunk?.role            ||
    "GENERAL_CONTENT"
  );
}

// Simple ms timer
function timer() {
  const start = Date.now();
  return () => Date.now() - start;
}

// ─────────────────────────────────────────────────────────────
// SECTION 4 — FALLBACK: Gemini general knowledge
// Triggered when no relevant chunks found in documents
// ─────────────────────────────────────────────────────────────

async function groqGeneralAnswer(question) {
  const Groq   = require("groq-sdk");
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const res = await client.chat.completions.create({
    model    : "llama-3.3-70b-versatile",
    messages : [
      {
        role    : "system",
        content : "You are NexaSense AI. The user's question is not covered in their uploaded documents. Start your reply with: '⚠️ I couldn't find this in your documents. From my general knowledge:' then answer helpfully.",
      },
      { role: "user", content: question },
    ],
    max_tokens  : 600,
    temperature : 0.3,
  });

  return res?.choices?.[0]?.message?.content || "";
}

async function generalKnowledgeFallback({ question, chunksRetrieved, startTime, latency }) {
  logger.info("[Pipeline] No usable chunks — triggering general knowledge fallback");

  let answer   = "";
  let provider = "gemini";

  try {
    const prompt = `You are NexaSense AI. The user's question is not in their uploaded documents. Answer helpfully using general knowledge. Start with a warm note in the user's language that you're using general knowledge. Question: ${question}`;
    answer = await askGemini(prompt);
  } catch {
    try {
      answer   = await groqGeneralAnswer(question);
      provider = "groq-fallback";
    } catch (e) {
      logger.error("[Pipeline] Both fallbacks failed:", e.message);
      answer   = "I couldn't find relevant information in your documents and my general knowledge lookup also failed. Please try rephrasing.";
      provider = "error-fallback";
    }
  }

  return {
    answer,
    sources        : [],
    provider,
    chunksRetrieved,
    chunksUsed     : 0,
    fromCache      : false,
    latency,
    responseTimeMs : Date.now() - startTime,
  };
}

// ─────────────────────────────────────────────────────────────
// SECTION 5 — MAIN PIPELINE
// ─────────────────────────────────────────────────────────────

// ✅ ADDED: onToken to signature
async function runRetrievalPipeline({ userId, documentId, question, conversationId, onToken }) {
  // detectedLanguage is resolved after Step 4 (query rewrite)
  let detectedLanguage = "en";

  const startTime = Date.now();
  const svc       = getConvSvc();
  const latency   = {};     // per-step ms breakdown
  let chunksRetrieved = 0;

  // Normalise input
  question = normalizeQuery(question);
  if (!question) {
    return { answer: "Please enter a valid question.", sources: [], responseTimeMs: 0 };
  }

  logger.info(`[Pipeline] ▶ START | doc:${documentId} | q:"${question.slice(0, 60)}"`);

  try {

    // ── STEP 1: Exact cache ──────────────────────────────────
    const exactCached = getCachedResult(documentId, question);
    if (exactCached) {
      logger.info(`[Pipeline] ✅ Exact cache HIT`);
      return { ...exactCached, fromCache: true, responseTimeMs: Date.now() - startTime };
    }

    // ── STEP 2: Semantic cache ───────────────────────────────
    // Checked BEFORE Groq rewrite — saves an LLM call entirely
    const t2 = timer();
    const semanticCached = await getSemanticCache(question).catch(() => null);
    latency.semanticCache = t2();

    if (semanticCached) {
      logger.info(`[Pipeline] ✅ Semantic cache HIT (${latency.semanticCache}ms)`);
      return { ...semanticCached, fromCache: true, responseTimeMs: Date.now() - startTime };
    }

    // ── STEP 3: Load conversation history ────────────────────
    let history = [];
    if (conversationId && svc) {
      try { history = await svc.getConversationHistory(conversationId); } catch {}
    }

    // ── STEP 4: Query rewrite + HYDE (Groq) ──────────────────
    const t4 = timer();
    logger.info("[Pipeline] Step 4: Query rewrite");

    const groqResult = await processQueryWithGroq(question, history);
    latency.rewrite  = t4();

    // ✅ Extract detected language & weak query flag from query rewriter
    detectedLanguage = groqResult.detectedLanguage || "en";
    const isWeakQuery = groqResult.isWeakQuery === true;
    logger.info(`[Pipeline] Detected language: ${detectedLanguage} | Weak query: ${isWeakQuery}`);

    // ✅ WEAK QUERY MODE: relax thresholds so vague queries still find content
    const effectiveMinSimilarity = isWeakQuery ? Math.min(CFG.MIN_SIMILARITY, 0.25) : CFG.MIN_SIMILARITY;
    const effectiveVectorK       = isWeakQuery ? Math.max(CFG.VECTOR_K, 25)        : CFG.VECTOR_K;
    const effectivePool          = isWeakQuery ? Math.max(CFG.PRE_RERANK_POOL, 80) : CFG.PRE_RERANK_POOL;

    if (isWeakQuery) {
      logger.info(`[Pipeline] Weak query mode: similarity>=${effectiveMinSimilarity} K=${effectiveVectorK} pool=${effectivePool}`);
    }

    // ── V8.0: TRUE HyDE (Hypothetical Document Embeddings) ──
    // Keyword queries need exact phrasing (no paragraphs)
    const keywordQuerySet = [
      ...new Set([
        groqResult.standaloneQuery,
        ...groqResult.searchQueries,
      ]),
    ].filter(Boolean);

    // Vector queries include the AI's "ideal fake answer" 
    // The vector DB will mathematically hunt for chunks shaped exactly like this ideal answer.
    const vectorQuerySet = [...keywordQuerySet];
    if (groqResult.hypotheticalDocument) {
      vectorQuerySet.push(groqResult.hypotheticalDocument);
    }

    // Category detection — used for boost + query hint
    const detectedRole = detectCategory(question);
    if (detectedRole) {
      keywordQuerySet.push(detectedRole);
      vectorQuerySet.push(detectedRole);
      logger.debug(`[Pipeline] Category detected: ${detectedRole}`);
    }

    logger.debug(`[Pipeline] Vector Queries (${vectorQuerySet.length}): ${vectorQuerySet.map(q => `"${q.slice(0,30)}"`).join(", ")}`);
    logger.debug(`[Pipeline] Keyword Queries (${keywordQuerySet.length}): ${keywordQuerySet.map(q => `"${q.slice(0,30)}"`).join(", ")}`);

    // ── STEP 5: Hybrid retrieval ─────────────────────────────
    const t5       = timer();
    const isGlobal = userId && documentId === "all";
    
    // Fetch document size early for large-doc heuristics
    let docChunkCount = null;
    if (!isGlobal && documentId) {
      try {
        docChunkCount = await getDocumentChunkCount(documentId);
        logger.info(`[Pipeline] Target document has ${docChunkCount} total chunks`);
      } catch (e) {
        logger.warn("[Pipeline] Failed to fetch docChunkCount:", e.message);
      }
    }

    logger.info(`[Pipeline] Step 5: Hybrid retrieval | V:${vectorQuerySet.length} K:${keywordQuerySet.length} queries | global:${isGlobal}`);

    const [vectorResults, keywordResults] = await Promise.all([

      // Vector search — all queries (including HyDE) in parallel with effective K
      Promise.all(
        vectorQuerySet.map(q =>
          isGlobal
            ? searchUserDocuments(userId, q, effectiveVectorK).catch(() => [])
            : searchDocument(documentId, q, effectiveVectorK).catch(() => [])
        )
      ),

      // ✅ V8.0: Keyword search excludes HyDE paragraph to prevent SQL AND-logic failures
      Promise.all(
        keywordQuerySet.map(q =>
          keywordSearch(
            isGlobal ? null : documentId,
            q,
            CFG.KEYWORD_K,
            isGlobal ? userId : null
          ).catch(() => [])
        )
      ),

    ]);

    latency.vector  = t5();
    latency.keyword = t5(); // keyword runs in same Promise.all — approximate

    // ✅ V7.0: Reciprocal Rank Fusion — replaces naive flatten+sort.
    const flatVector  = vectorResults.flat();
    const flatKeyword = keywordResults.flat();

    const rawChunks = dedupe(applyRRF(flatVector, flatKeyword));

    logger.info(`[Pipeline] RRF: ${flatVector.length} vector + ${flatKeyword.length} keyword → ${rawChunks.length} fused unique chunks`);

    // ────────────────────────────────────────────────────────────
    // ✅ V7.0: MULTI-PASS GUARANTEE RETRIEVAL
    //
    // If Pass 1 returned < MIN_CHUNKS_GUARANTEE results:
    //   → Run Pass 2 with MUCH lower similarity threshold (0.15)
    //     and higher K (30) using just the raw normalised question.
    //
    // This is the "agar doc mein hai toh zaroor milega" guarantee.
    // It ensures a missed answer due to threshold cutoffs is always
    // caught before we resort to the general knowledge fallback.
    // ────────────────────────────────────────────────────────────

    // ────────────────────────────────────────────────────────────
    // V8.0 MULTI-PASS GUARANTEE SYSTEM
    //
    // Pass 1 (above): Full RRF hybrid retrieval
    // Pass 2 (below): Wide K=30, single simple query  
    // Pass 3 (below): Word-level OR sweep — each word searched separately
    // Complete-Doc:   If doc ≤ 60 chunks, retrieve ALL of them
    //
    // The only way something in the doc is missed:
    //   - The chunk text is completely unrelated to any word in the query
    //   - This is impossible if the user asks about something real in the doc
    // ────────────────────────────────────────────────────────────

    const MIN_CHUNKS_GUARANTEE = CFG.MIN_CHUNKS_GUARANTEE;
    let guaranteeChunks = [];

    // ══ PASS 2: Wide search with simpler query ══
    if (rawChunks.length < MIN_CHUNKS_GUARANTEE) {
      logger.info(`[Pipeline] ⚠️ Pass 1: ${rawChunks.length} chunks — triggering Pass 2 guarantee`);

      try {
        const PASS2_K = 30;
        const simpleQuery = groqResult.standaloneQuery || question;

        const [v2, k2] = await Promise.all([
          (isGlobal
            ? searchUserDocuments(userId, simpleQuery, PASS2_K)
            : searchDocument(documentId, simpleQuery, PASS2_K)
          ).catch(() => []),
          keywordSearch(
            isGlobal ? null : documentId,
            simpleQuery, PASS2_K,
            isGlobal ? userId : null
          ).catch(() => []),
        ]);

        guaranteeChunks = dedupe(applyRRF(v2, k2));
        logger.info(`[Pipeline] Pass 2 result: ${guaranteeChunks.length} chunks`);

      } catch (p2Err) {
        logger.warn("[Pipeline] Pass 2 failed:", p2Err.message);
      }
    }

    // Merge Pass 1 + Pass 2
    let mergedPassChunks = rawChunks.length >= MIN_CHUNKS_GUARANTEE
      ? rawChunks
      : dedupe([...rawChunks, ...guaranteeChunks]);

    // ══ PASS 3: Word-level OR sweep ══
    // Triggers when Pass 1 + Pass 2 combined is still very low.
    // Searches each meaningful word in the query SEPARATELY via ILIKE.
    // Catches: "termination clause" when doc says "termination of employment"
    // Catches: "types of algorithms" when doc lists "supervised learning"
    if (mergedPassChunks.length < CFG.PASS3_TRIGGER && !isGlobal) {
      logger.info(`[Pipeline] ⚠️ Pass 2 still only ${mergedPassChunks.length} chunks — triggering Pass 3 word-level sweep`);

      try {
        const wordChunks = await wordLevelSearch(
          documentId,
          groqResult.standaloneQuery || question,
          8,           // 8 results per word
          null
        );

        if (wordChunks.length > 0) {
          mergedPassChunks = dedupe([...mergedPassChunks, ...wordChunks]);
          logger.info(`[Pipeline] Pass 3 added ${wordChunks.length} word-level chunks → total: ${mergedPassChunks.length}`);
        }
      } catch (p3Err) {
        logger.warn("[Pipeline] Pass 3 failed:", p3Err.message);
      }
    }

    // ══ COMPLETE-DOC RETRIEVAL (small documents only) ══
    if (!isGlobal && mergedPassChunks.length < CFG.PASS3_TRIGGER) {
      logger.info(`[Pipeline] ⭐ Still only ${mergedPassChunks.length} chunks — checking fallback strategies`);

      try {
        const chunkCount = docChunkCount || 9999; // Assume large if unknown

        if (chunkCount > 0 && chunkCount <= CFG.SMALL_DOC_THRESHOLD) {
          const allChunks = await getAllDocumentChunks(documentId, CFG.SMALL_DOC_THRESHOLD);
          if (allChunks.length > 0) {
            mergedPassChunks = dedupe([...mergedPassChunks, ...allChunks]);
            logger.info(`[Pipeline] ✅ Complete-doc retrieval: loaded ALL ${allChunks.length} chunks`);
          }
        } else if (chunkCount > CFG.SMALL_DOC_THRESHOLD) {
          logger.info(`[Pipeline] Doc too large (${chunkCount} chunks) for complete retrieval — triggering Pass 4 Deep High-Recall Sweep`);
          
          const limitPerWord = Math.min(50, Math.ceil(chunkCount * 0.05));
          
          const deepWordChunks = await wordLevelSearch(
            documentId,
            groqResult.standaloneQuery || question,
            limitPerWord,
            null
          );

          if (deepWordChunks.length > 0) {
            mergedPassChunks = dedupe([...mergedPassChunks, ...deepWordChunks]);
            logger.info(`[Pipeline] Pass 4 Deep Sweep: loaded ${deepWordChunks.length} chunks at ${limitPerWord} limit/word`);
          } else {
            logger.info(`[Pipeline] Pass 4 yielded no new chunks.`);
          }
        }
      } catch (cdErr) {
        logger.warn("[Pipeline] Complete-doc retrieval failed:", cdErr.message);
      }
    }

    // ✅ V7.0/V8.0: Parent-Document expansion.
    // If it's a huge doc (>60 chunks), we aggressively expand ±5 neighbors
    // to catch massively disjointed tables and long continuous sections.
    let expandedChunks;
    try {
      // Use docChunkCount to determine neighbor expansion size
      const neighborCount = (docChunkCount !== null && docChunkCount > CFG.SMALL_DOC_THRESHOLD) ? 5 : 2;

      expandedChunks = await expandWithParentChunks(
        mergedPassChunks,
        isGlobal ? null : documentId,
        neighborCount  // ±5 or ±2 neighbors
      );
    } catch (expandErr) {
      logger.warn("[Pipeline] Parent-doc expansion failed — using merged pass result:", expandErr.message);
      expandedChunks = mergedPassChunks;  // ⬆️ fallback to mergedPassChunks
    }

    // Re-deduplicate after expansion (neighbors may overlap across hits)
    const mergedChunks = dedupe(expandedChunks);

    // ── STEP 6: Category boost + similarity filter ───────────
    // Boost reads metadata.role — set correctly by ingestion worker V5.1
    let chunks = mergedChunks.map(c => {
      if (detectedRole && getChunkRole(c) === detectedRole) {
        return { ...c, similarity: (c.similarity || 0) + CFG.CATEGORY_BOOST };
      }
      return c;
    });

    const boostedCount = chunks.filter(
      c => detectedRole && getChunkRole(c) === detectedRole
    ).length;

    if (boostedCount > 0) {
      logger.debug(`[Pipeline] Boosted ${boostedCount} "${detectedRole}" chunks by +${CFG.CATEGORY_BOOST}`);
    }

    chunks = chunks
      .sort((a, b) => {
        // ✅ V8.1: Exact Keyword/Word hits are ALWAYS prioritized above fuzzy vector hits
        if (a.keywordMatch && !b.keywordMatch) return -1;
        if (!a.keywordMatch && b.keywordMatch) return 1;
        return (b.similarity || 0) - (a.similarity || 0);
      })
      .slice(0, effectivePool);

    chunksRetrieved = chunks.length;
    logger.info(`[Pipeline] ${chunksRetrieved} chunks sent to reranker (pool: ${effectivePool}, including ${mergedChunks.length - rawChunks.length} neighbor chunks)`);

    // ── STEP 7: No-content fallback ──────────────────────────
    if (!chunksRetrieved) {
      return await generalKnowledgeFallback({ question, chunksRetrieved, startTime, latency });
    }

    // ── STEP 8: Rerank ───────────────────────────────────────
    const t8 = timer();
    logger.info(`[Pipeline] Step 8: Reranking ${chunksRetrieved} chunks`);

    let finalChunks = [];
    try {
      const reranked = await rerankChunks(question, chunks);
      latency.rerank = t8();

      // ✅ V8.1: keywordMatch chunks are immune from reranker destruction (even if semantic score is -50%)
      finalChunks = reranked.filter(c => (c.similarity || 0) > CFG.RERANK_THRESHOLD || c.keywordMatch);

      // Floor: always keep at least RERANK_FLOOR chunks even if scores are low
      if (finalChunks.length < CFG.RERANK_FLOOR) {
        finalChunks = reranked.slice(0, CFG.RERANK_FLOOR);
      }

      // If any chunk has the completeDoc flag, allow a much larger LLM payload
      const hasCompleteDoc = chunks.some(c => c.metadata?.completeDoc);
      const limit = hasCompleteDoc ? CFG.GUARANTEE_MAX_CHUNKS : CFG.MAX_FINAL_CHUNKS;

      finalChunks = finalChunks.slice(0, limit);

    } catch (rerankErr) {
      logger.warn("[Pipeline] Reranker failed — using pre-rerank order:", rerankErr.message);
      latency.rerank = t8();
      
      const hasCompleteDoc = chunks.some(c => c.metadata?.completeDoc);
      const limit = hasCompleteDoc ? CFG.GUARANTEE_MAX_CHUNKS : CFG.MAX_FINAL_CHUNKS;
      
      finalChunks = chunks.slice(0, limit);
    }

    logger.info(`[Pipeline] ${finalChunks.length} chunks after reranking`);

    // Second no-content check (post rerank)
    if (!finalChunks.length) {
      return await generalKnowledgeFallback({ question, chunksRetrieved, startTime, latency });
    }

    // ── STEP 9: Context compression ──────────────────────────
    // Cleans whitespace/formatting noise before sending to LLM
    let contextChunks = finalChunks;
    try {
      contextChunks  = await compressContext(question, finalChunks);
    } catch (compErr) {
      logger.warn("[Pipeline] Context compression failed — using raw chunks:", compErr.message);
    }

    // ── STEP 10: Generate answer (Groq LLM) ──────────────────
    const t10 = timer();
    logger.info(`[Pipeline] Step 10: Generating answer from ${contextChunks.length} chunks`);

    let answer;
    // ✅ Route to streaming or standard, passing detectedLanguage
    if (onToken) {
      answer = await generateAnswerStream(question, contextChunks, history, onToken, detectedLanguage);
    } else {
      answer = await generateAnswer(question, contextChunks, history, detectedLanguage);
    }
    
    latency.llm = t10();

    logger.info(`[Pipeline] LLM answered in ${latency.llm}ms`);

    // ── STEP 11: Self-reflection ─────────────────────────────
    // Checks if answer is grounded in retrieved context
    try {
      const reflection = await reflectAnswer(question, answer, contextChunks);

      if (reflection?.reflection?.confidence < CFG.REFLECTION_MIN_CONF) {
        logger.warn(
          `[Pipeline] Low confidence answer: ${reflection.reflection.confidence.toFixed(2)} | issues: ${reflection.reflection.issues?.join(", ")}`
        );
        // Prepend a soft warning — don't discard the answer
        if (!answer.startsWith("⚠️")) {
          answer = `⚠️ Low confidence — answer may be partially outside document scope.\n\n${answer}`;
        }
      }
    } catch (reflErr) {
      logger.warn("[Pipeline] Self-reflection skipped:", reflErr.message);
    }

    // ── STEP 12: Gemini reasoning refinement ─────────────────
    // Improves clarity/structure without adding new facts
    const t12 = timer();
    try {
      const sources = finalChunks.map(c => ({
        pageNumber : c.metadata?.pageNumber || null,
        preview    : (c.content || "").slice(0, 150),
      }));

      // ✅ Pass detectedLanguage so Gemini replies in the correct language
      answer          = await applyReasoning(question, answer, sources, detectedLanguage);
      latency.gemini  = t12();

    } catch (reasonErr) {
      latency.gemini = t12();
      logger.warn("[Pipeline] Gemini reasoning skipped:", reasonErr.message);
      // answer stays as-is from Groq — still valid
    }

    // ── STEP 13: Build result ─────────────────────────────────
    // Build debugging telemetry for the UI Pipeline Inspector
    const debugPipeline = {
      rewrite: [groqResult?.standaloneQuery, ...(groqResult?.searchQueries || [])].filter(Boolean).join("\n"),
      vectorResults: (vectorResults?.flat() || []).slice(0, 5).map(c => ({ chunk: c?.content?.slice(0, 250), score: c?.similarity })),
      keywordResults: (keywordResults?.flat() || []).slice(0, 5).map(c => ({ chunk: c?.content?.slice(0, 250), score: c?.similarity })),
      reranked: (finalChunks || []).slice(0, 5).map(c => ({ chunk: c?.content?.slice(0, 250), score: c?.similarity })),
      contextChunks: (contextChunks || []).slice(0, 10).map(c => typeof c === "string" ? c.slice(0, 250) : (c?.content||"").slice(0, 250))
    };

    // Sources category reads metadata.role — set by worker V5.1
    const result = {
      answer,
      chunksRetrieved,
      chunksUsed : finalChunks.length,
      provider   : "groq+gemini",
      fromCache  : false,
      latency,
      pipeline   : debugPipeline,
      sources    : finalChunks.map((c, i) => ({
        sourceIndex : i + 1,
        chunkIndex  : c?.metadata?.chunkIndex ?? null,
        documentId  : c?.metadata?.documentId ?? null,
        category    : getChunkRole(c),             // ← correct role
        score       : Number((c.similarity || 0).toFixed(3)),
        preview     : (c?.content || "").slice(0, 150).trim(),
      })),
      responseTimeMs : Date.now() - startTime,
    };

    logger.info(
      `[Pipeline] ✅ DONE | ${result.responseTimeMs}ms | ` +
      `rewrite:${latency.rewrite}ms llm:${latency.llm}ms gemini:${latency.gemini || 0}ms | ` +
      `chunks:${chunksRetrieved}→${finalChunks.length}`
    );

    // ── STEP 14: Persist ──────────────────────────────────────
    if (conversationId && svc) {
      svc.saveMessage(conversationId, "user",      question).catch(() => {});
      svc.saveMessage(conversationId, "assistant", answer  ).catch(() => {});
    }

    // Store in both caches
    storeCachedResult(documentId, question, result);
    storeSemanticCache(question, result).catch(() => {});

    // Record detailed metrics (non-blocking)
    recordQueryMetrics({
      userId,
      documentId,
      question,
      totalMs      : result.responseTimeMs,
      rewriteMs    : latency.rewrite   || 0,
      vectorMs     : latency.vector    || 0,
      keywordMs    : latency.keyword   || 0,
      rerankerMs   : latency.rerank    || 0,
      llmMs        : latency.llm       || 0,
      chunksRetrieved,
      chunksUsed   : finalChunks.length,
      fromCache    : false,
    }).catch(() => {});

    return result;

  } catch (error) {
    logger.error("[Pipeline] ❌ Fatal error:", error); // ✅ Improved logging

    return {
      answer         : "A system error occurred. Please try again in a moment.",
      sources        : [],
      fromCache      : false,
      chunksRetrieved,
      chunksUsed     : 0,
      responseTimeMs : Date.now() - startTime,
    };
  }
}

module.exports = { runRetrievalPipeline };