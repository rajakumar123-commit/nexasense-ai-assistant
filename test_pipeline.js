// Full pipeline trace - mirrors exact retrieval.pipeline.js logic
require("dotenv").config();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err.message, err.stack);
  process.exit(99);
});
process.on("unhandledRejection", (r) => {
  console.error("UNHANDLED REJECTION:", r?.message || String(r));
});

const { processQueryWithGroq } = require("./src/services/queryRewrite.service");
const { searchDocument } = require("./src/services/vectorSearch.service");
const { keywordSearch } = require("./src/services/keywordSearch.service");
const { rerankChunks } = require("./src/services/reranker.service");
const { compressContext } = require("./src/services/contextCompression.service");
const { generateAnswer } = require("./src/services/llm.service");
const { getSemanticCache } = require("./src/cache/semanticCache");

const DOC_ID = "89344817-6ae5-4359-9671-ca4fdde25a4f";
const QUESTION = "what is supervised learning";

async function run() {
  console.log(">>> STEP 1: Semantic Cache");
  const cached = await getSemanticCache(QUESTION);
  console.log("  cache:", !!cached);

  console.log(">>> STEP 2: Groq Rewrite");
  const groqResult = await processQueryWithGroq(QUESTION, []);
  const question = groqResult.standaloneQuery;
  const rewrittenQueries = [...new Set([question, ...groqResult.searchQueries])];
  const hypotheticalDoc = groqResult.hypotheticalDocument || question;
  console.log("  rewritten:", rewrittenQueries.length, "queries");

  console.log(">>> PAUSING 3 SECONDS...");
  await new Promise(r => setTimeout(r, 3000));

  console.log(">>> STEP 3: Build promises");
  const vectorPromises = [
    searchDocument(DOC_ID, hypotheticalDoc),
    ...rewrittenQueries.map(q => searchDocument(DOC_ID, q))
  ];
  const keywordQueries = [...rewrittenQueries, hypotheticalDoc];
  const keywordPromises = keywordQueries.map(q => keywordSearch(DOC_ID, q));
  console.log("  vector:", vectorPromises.length, "keyword:", keywordPromises.length);

  console.log(">>> STEP 4: Await all promises");
  const [vectorResults, keywordResults] = await Promise.all([
    Promise.all(vectorPromises),
    Promise.all(keywordPromises)
  ]);
  console.log("  vector batches:", vectorResults.length, "keyword batches:", keywordResults.length);

  let chunks = [];
  vectorResults.forEach(r => chunks.push(...r.slice(0, 3)));
  keywordResults.forEach(r => chunks.push(...r.slice(0, 2)));
  console.log("  total chunks before dedupe:", chunks.length);

  // Simple dedupe
  const seen = new Set();
  chunks = chunks.filter(c => {
    const key = (c.content || "").substring(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
  console.log("  chunks after dedupe:", chunks.length);

  console.log(">>> STEP 5: Rerank");
  let finalChunks = [];
  if (chunks.length) {
    const reranked = await rerankChunks(question, chunks);
    finalChunks = reranked.slice(0, 7);
  }
  console.log("  final chunks:", finalChunks.length);

  console.log(">>> STEP 6: Context compression");
  try {
    const compressed = await compressContext(question, finalChunks);
    finalChunks = compressed?.map((c, i) => ({
      ...finalChunks[i],
      content: c?.content || finalChunks[i]?.content
    })) || finalChunks;
  } catch (e) { console.error("  compression error:", e.message); }
  console.log("  compressed OK");

  console.log(">>> STEP 7: Generate answer");
  const answer = await generateAnswer(question, finalChunks, []);
  console.log("  answer length:", answer?.length);
  console.log("  FIRST 200:", (answer || "").substring(0, 200));

  console.log("=== ALL STEPS PASSED ===");
  process.exit(0);
}

run().catch(e => {
  console.error("FATAL:", e.message, e.stack);
  process.exit(1);
});
