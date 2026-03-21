// ============================================================
// sharedEmbedder.js
// NexaSense AI Assistant
// Single shared embedding model singleton.
// All services import from here — prevents loading the model
// 5 separate times and guarantees one WASM instance in the
// worker process.
// ============================================================

// Must be set BEFORE importing @xenova/transformers
process.env.TRANSFORMERS_BACKEND = "wasm";

const { pipeline, env } = require("@xenova/transformers");
const logger = require("../utils/logger");

env.allowLocalModels = false;
env.useBrowserCache  = false;

const MODEL              = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM      = 384;

let   _embedder      = null;
let   _loadingPromise = null;


// ------------------------------------------------------------
// Load model (singleton + concurrency safe)
// ------------------------------------------------------------

async function getEmbedder() {
  if (_embedder) return _embedder;

  if (!_loadingPromise) {
    logger.info("[SharedEmbedder] Loading model...");

    _loadingPromise = pipeline("feature-extraction", MODEL)
      .then(model => {
        _embedder = model;
        logger.info("[SharedEmbedder] Model ready");
        return model;
      })
      .catch(err => {
        _loadingPromise = null;
        throw err;
      });
  }

  return _loadingPromise;
}


// ------------------------------------------------------------
// Embed a batch of texts → number[][] (one vector per text)
// ------------------------------------------------------------

async function embedTexts(texts) {
  if (!texts || texts.length === 0) return [];

  const model  = await getEmbedder();
  const output = await model(texts, { pooling: "mean", normalize: true });

  const embeddings = output.tolist(); // returns number[][]

  embeddings.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== EMBEDDING_DIM) {
      throw new Error(
        `[SharedEmbedder] Invalid embedding at index ${i}: got length ${e?.length}`
      );
    }
  });

  return embeddings;
}


// ------------------------------------------------------------
// Embed a single text → number[] (flat vector)
// ------------------------------------------------------------

async function embedSingle(text) {
  if (!text || typeof text !== "string") return [];

  const model  = await getEmbedder();
  const output = await model(text, { pooling: "mean", normalize: true });

  // output.data is a flat Float32Array for a single input
  return Array.from(output.data || []);
}


module.exports = { getEmbedder, embedTexts, embedSingle, EMBEDDING_DIM };
