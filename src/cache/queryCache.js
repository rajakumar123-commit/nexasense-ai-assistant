const NodeCache = require("node-cache");

// ─────────────────────────────────────────────────────────────
// Cache Configuration
//
// TTL: 5 minutes — good for document Q&A (doc doesn't change)
// Check period: 2 minutes — clean up expired keys
// Use clones: false — faster (we don't mutate cached objects)
// ─────────────────────────────────────────────────────────────
const CACHE_TTL          = 300;  // 5 minutes
const CACHE_CHECK_PERIOD = 120;  // 2 minutes

const queryCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 120,
  useClones: false,
  maxKeys: 5000
});

// ── Internal stats tracking ─────────────────────────────────
let stats = { hits: 0, misses: 0, stores: 0 };

// ── Key generation ───────────────────────────────────────────
function createCacheKey(documentId, question) {
  // Normalize: lowercase + collapse spaces → consistent keys
  const normalized = question.toLowerCase().trim().replace(/\s+/g, " ");
  return `${documentId}:${normalized}`;
}

// ── Get cached result ────────────────────────────────────────
function getCachedResult(documentId, question) {
  const key    = createCacheKey(documentId, question);
  const result = queryCache.get(key);

  if (result !== undefined) {
    stats.hits++;
    console.log(`[Cache] HIT  | key: ${key.slice(0, 60)} | hits:${stats.hits}`);
    return result;
  }

  stats.misses++;
  return null;
}

// ── Store result ─────────────────────────────────────────────
function storeCachedResult(documentId, question, data) {
  const key = createCacheKey(documentId, question);

  // Don't cache error responses
  if (data?.error) {
    console.log("[Cache] SKIP — error response not cached");
    return;
  }

  queryCache.set(key, data);
  stats.stores++;
  console.log(`[Cache] STORED | key: ${key.slice(0, 60)} | stores:${stats.stores}`);
}

// ── Invalidate all cache for a document ─────────────────────
// Call this when a document is re-uploaded or deleted
function invalidateDocument(documentId) {
  const keys       = queryCache.keys();
  const docKeys    = keys.filter(k => k.startsWith(`${documentId}:`));
  const deleted    = queryCache.del(docKeys);
  console.log(`[Cache] INVALIDATED ${deleted} keys for document ${documentId}`);
  return deleted;
}

// ── Clear entire cache ───────────────────────────────────────
function clearCache() {
  queryCache.flushAll();
  stats = { hits: 0, misses: 0, stores: 0 };
  console.log("[Cache] CLEARED");
}

// ── Get cache stats (useful for health endpoint) ─────────────
function getCacheStats() {
  const nodeStats = queryCache.getStats();
  return {
    hits:   stats.hits,
    misses: stats.misses,
    stores: stats.stores,
    hitRate: stats.hits + stats.misses > 0
      ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1) + "%"
      : "0%",
    keysStored: nodeStats.keys,
    memorySizeKb: (nodeStats.vsize / 1024).toFixed(1)
  };
}

module.exports = {
  getCachedResult,
  storeCachedResult,
  invalidateDocument,
  clearCache,
  getCacheStats
};