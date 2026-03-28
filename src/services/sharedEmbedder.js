// ============================================================
// sharedEmbedder.js
// NexaSense AI Assistant
// Single shared embedding model singleton (Isolated OS Process)
// FIX: Using child_process completely prevents Node 20
// Segmentation Faults caused by ONNX C++ bindings colliding
// with Express libuv threads, because native C++ addons
// cannot cross OS process boundaries.
// ============================================================

const { fork } = require("child_process");
const path = require("path");

const EMBEDDING_DIM = 384;

if (process.env.IS_EMBED_WORKER === 'true') {
  // ==========================================================
  // ISOLATED CHILD PROCESS - Runs native ONNX safely
  // ==========================================================
  const { pipeline, env } = require("@xenova/transformers");
  
  env.allowLocalModels = false;
  env.useBrowserCache  = false;
  env.backends.onnx.numThreads = 1;
  env.backends.onnx.wasm.numThreads = 1;

  const MODEL = "Xenova/all-MiniLM-L6-v2";
  let _embedder = null;
  let _inferenceMutex = Promise.resolve();

  async function initPipeline() {
    if (!_embedder) {
      _embedder = await pipeline("feature-extraction", MODEL);
      process.send({ type: "ready" });
    }
    return _embedder;
  }
  
  // Start loading instantly on worker spawn
  initPipeline().catch(err => {
    process.send({ type: "error", error: err.message });
  });

  process.on("message", (msg) => {
    const { id, method, payload } = msg;

    // Queue behind the mutex — model may still be loading on first call
    _inferenceMutex = _inferenceMutex.then(async () => {
      try {
        const model = await initPipeline();   // no-op after first load

        if (method === "embedSingle") {
          // payload is a single string
          const output = await model([payload], { pooling: "mean", normalize: true });
          // output.tolist() → number[][] — take first row for a single text
          process.send({ type: "result", id, result: output.tolist()[0] });

        } else if (method === "embedTexts") {
          // payload is string[]
          const output = await model(payload, { pooling: "mean", normalize: true });
          process.send({ type: "result", id, result: output.tolist() });

        } else {
          process.send({ type: "error", id, error: `Unknown method: ${method}` });
        }
      } catch (err) {
        process.send({ type: "error", id, error: err.message });
      }
    }).catch(err => {
      // ✅ CRITICAL FIX: Catch fatal native errors to prevent permanent mutex locking
      console.error("[SharedEmbedder] Fatal Mutex Chain Error:", err);
    });
  });

} else {
  // ==========================================================
  // MAIN PROCESS - Proxy requests to isolated child
  // ==========================================================
  const logger = require("../utils/logger");
  let embedChild = null;
  let requestIdCounter = 0;
  const pendingRequests = new Map();

  function initWorker() {
    if (embedChild) return embedChild;
    
    logger.info("[SharedEmbedder] Spawning separate OS process for ONNX...");
    
    // Fork this file, enforcing memory isolation
    embedChild = fork(__filename, [], { 
      env: { ...process.env, IS_EMBED_WORKER: 'true' } 
    });
    
    embedChild.on("message", (msg) => {
      if (msg.type === "ready") {
        logger.info("[SharedEmbedder] Child process model ready");
      } else if (msg.type === "result") {
        const { id, result } = msg;
        if (pendingRequests.has(id)) {
          pendingRequests.get(id).resolve(result);
          pendingRequests.delete(id);
        }
      } else if (msg.type === "error") {
        const { id, error } = msg;
        if (id && pendingRequests.has(id)) {
          pendingRequests.get(id).reject(new Error(error));
          pendingRequests.delete(id);
        } else {
          logger.error("[SharedEmbedder Child Error]:", error);
        }
      }
    });

    embedChild.on("error", (err) => {
      logger.error("[SharedEmbedder Child Crash]:", err.message);
      for (const req of pendingRequests.values()) req.reject(err);
      pendingRequests.clear();
      embedChild = null;
    });

    embedChild.on("exit", (code) => {
      if (code !== 0) logger.error(`[SharedEmbedder Child] Exit code ${code}`);
      for (const req of pendingRequests.values()) req.reject(new Error(`Child exited with code ${code}`));
      pendingRequests.clear();
      embedChild = null;
    });
    
    return embedChild;
  }

  function callWorker(method, payload) {
    return new Promise((resolve, reject) => {
      const child = initWorker();
      const id = ++requestIdCounter;
      pendingRequests.set(id, { resolve, reject });
      child.send({ id, method, payload });
    });
  }

  async function embedTexts(texts) {
    if (!texts || texts.length === 0) return [];
    return callWorker("embedTexts", texts);
  }

  async function embedSingle(text) {
    if (!text || typeof text !== "string") return [];
    return callWorker("embedSingle", text);
  }

  function getEmbedder() {
    initWorker();
    return Promise.resolve(true);
  }

  module.exports = { getEmbedder, embedTexts, embedSingle, EMBEDDING_DIM };
}