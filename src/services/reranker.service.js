
const { pipeline } = require("@xenova/transformers");

let reranker = null;

async function getReranker() {
  if (!reranker) {
    console.log("[Reranker] Loading reranker model...");
    reranker = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    console.log("[Reranker] Model loaded");
  }
  return reranker;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function embed(text, model) {
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

async function rerankChunks(query, chunks) {
  if (!chunks.length) return [];

  const model = await getReranker();
  const queryVector = await embed(query, model);
  const scored = [];

  for (const chunk of chunks) {
    const chunkVector = await embed(chunk.content, model);
    const score = cosineSimilarity(queryVector, chunkVector);
    scored.push({ ...chunk, rerankScore: score });
  }

  scored.sort((a, b) => b.rerankScore - a.rerankScore);
  return scored;
}

module.exports = { rerankChunks };
