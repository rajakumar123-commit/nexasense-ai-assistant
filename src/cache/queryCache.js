// ============================================================
// queryCache.js
// NexaSense AI Assistant
// In-process LRU cache for exact-match query results
// FIX: Replaced all console.log with logger
// ============================================================

const NodeCache = require("node-cache");
const logger    = require("../utils/logger");

const CACHE_TTL          = 300;   // 5 minutes
const CACHE_CHECK_PERIOD = 120;   // 2 minutes

const queryCache = new NodeCache({
  stdTTL:     CACHE_TTL,
  checkperiod: CACHE_CHECK_PERIOD,
  useClones:  false,
  maxKeys:    5000
});

let stats = { hits: 0, misses: 0, stores: 0 };


// ── Key generation ────────────────────────────────────────────
function createCacheKey(documentId, question) {
  const q = question.toLowerCase().trim().slice(0, 80);
  return `${documentId}:${q}`;
}


// ── Get cached result ─────────────────────────────────────────
function getCachedResult(documentId, question) {
  const key    = createCacheKey(documentId, question);
  const result = queryCache.get(key);

  if (result !== undefined) {
    stats.hits++;
    logger.info(`[Cache] HIT | key: ${key.slice(0, 60)} | hits:${stats.hits}`);
    return result;
  }

  stats.misses++;
  return null;
}


// ── Store result ──────────────────────────────────────────────
function storeCachedResult(documentId, question, data) {
  const key = createCacheKey(documentId, question);

  if (data?.error) {
    logger.debug("[Cache] SKIP — error response not cached");
    return;
  }

  queryCache.set(key, data);
  stats.stores++;
  logger.info(`[Cache] STORED | key: ${key.slice(0, 60)} | stores:${stats.stores}`);
}


// ── Invalidate all cache for a document ──────────────────────
function invalidateDocument(documentId) {
  const keys    = queryCache.keys();
  const docKeys = keys.filter(k => k.startsWith(`${documentId}:`));
  const deleted = queryCache.del(docKeys);
  logger.info(`[Cache] INVALIDATED ${deleted} keys for document ${documentId}`);
  return deleted;
}


// ── Clear entire cache ────────────────────────────────────────
function clearCache() {
  queryCache.flushAll();
  stats = { hits: 0, misses: 0, stores: 0 };
  logger.info("[Cache] CLEARED");
}


// ── Get cache stats ───────────────────────────────────────────
function getCacheStats() {
  const nodeStats = queryCache.getStats();
  return {
    hits:         stats.hits,
    misses:       stats.misses,
    stores:       stats.stores,
    hitRate:      stats.hits + stats.misses > 0
                    ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1) + "%"
                    : "0%",
    keysStored:   nodeStats.keys,
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