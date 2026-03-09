const { pipeline } = require("@xenova/transformers");
const chroma = require("../config/chroma");

const MODEL = "Xenova/all-MiniLM-L6-v2";

let embedder = null;

async function getEmbedder() {

  if (!embedder) {

    console.log("[Embedder] Loading embedding model...");

    embedder = await pipeline("feature-extraction", MODEL);

    console.log("[Embedder] Model loaded");
  }

  return embedder;
}

async function embedQuery(query) {

  const model = await getEmbedder();

  const output = await model(query, {
    pooling: "mean",
    normalize: true
  });

  return Array.from(output.data);
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

function mmr(queryEmbedding, candidates, k = 5, lambda = 0.7) {

  const selected = [];
  const remaining = [...candidates];

  while (selected.length < k && remaining.length > 0) {

    let bestScore = -Infinity;
    let bestIndex = 0;

    for (let i = 0; i < remaining.length; i++) {

      const candidate = remaining[i];

      const relevance = cosineSimilarity(queryEmbedding, candidate.embedding);

      let diversity = 0;

      for (const s of selected) {

        const sim = cosineSimilarity(candidate.embedding, s.embedding);

        diversity = Math.max(diversity, sim);
      }

      const score = lambda * relevance - (1 - lambda) * diversity;

      if (score > bestScore) {

        bestScore = score;
        bestIndex = i;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}

async function searchDocument(documentId, query, k = 5) {

  const collectionName = `doc_${documentId.replace(/-/g, "_")}`;

  let collection;

  try {

    collection = await chroma.getCollection({ name: collectionName });

  } catch (err) {

    console.warn("[VectorSearch] Collection not found:", collectionName);

    return [];
  }

  const queryEmbedding = await embedQuery(query);

  const results = await collection.query({

    queryEmbeddings: [queryEmbedding],

    nResults: 15,

    include: ["documents", "metadatas", "embeddings", "distances"]
  });

  const docs = results.documents?.[0] || [];
  const metas = results.metadatas?.[0] || [];
  const embeddings = results.embeddings?.[0] || [];
  const distances = results.distances?.[0] || [];

  if (!docs.length) {

    console.warn("[VectorSearch] No results found");

    return [];
  }

  const candidates = docs.map((doc, i) => ({

    content: doc,

    metadata: metas[i] || {},

    embedding: embeddings[i] || null,

    similarity: 1 - (distances[i] || 0)
  }));

  const diversified = mmr(queryEmbedding, candidates, k);

  return diversified.map(c => ({

    content: c.content,

    metadata: c.metadata,

    similarity: parseFloat(c.similarity.toFixed(4))
  }));
}

module.exports = { searchDocument };