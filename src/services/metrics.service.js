// ============================================================
// Metrics Service
// NexaSense AI Assistant
// Prometheus instrumentation using prom-client
// ============================================================

const client = require("prom-client");
const logger = require("../utils/logger");

// 1. Create a Registry
const register = new client.Registry();

// 2. Add Default Metrics (CPU, Memory, etc.)
client.collectDefaultMetrics({ register });

// 3. Define Custom Metrics

// HTTP Metrics
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

// RAG Pipeline Metrics
const ragQueryDuration = new client.Histogram({
  name: "rag_query_duration_seconds",
  help: "Total time for a RAG query to complete",
  labelNames: ["model", "status"],
  buckets: [1, 2, 5, 10, 20, 30, 60]
});

const vectorSearchDuration = new client.Histogram({
  name: "vector_search_duration_seconds",
  help: "Time taken for vector database retrieval",
  labelNames: ["db_type"], // "chroma" or "pg"
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2]
});

// AI Usage Metrics
const llmTokensTotal = new client.Counter({
  name: "llm_tokens_total",
  help: "Total estimated tokens consumed",
  labelNames: ["model", "type"] // type: "prompt" or "completion"
});

// Ingestion Metrics
const ingestionStatusTotal = new client.Counter({
  name: "ingestion_status_total",
  help: "Counter for document ingestion outcomes",
  labelNames: ["type", "status"] // type: "file" or "url", status: "success" or "failed"
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(ragQueryDuration);
register.registerMetric(vectorSearchDuration);
register.registerMetric(llmTokensTotal);
register.registerMetric(ingestionStatusTotal);

/**
 * Middleware to track HTTP request duration
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.url;
    
    httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
  });
  
  next();
}

/**
 * Endpoint handler to expose metrics
 */
async function getMetrics(req, res) {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    logger.error(`[Metrics] Error generating metrics: ${err.message}`);
    res.status(500).send(err.message);
  }
}

/**
 * Persist query metrics to PostgreSQL (Legacy support)
 * Some components still call this to save to DB separately from Prometheus
 */
async function recordQueryMetrics({ userId, documentId, totalMs, fromCache }) {
  try {
    const db = require("../db");
    await db.query(
      `INSERT INTO query_metrics (user_id, document_id, total_ms, from_cache)
       VALUES ($1, $2, $3, $4)`,
      [
        userId,
        documentId === "all" ? null : documentId,
        totalMs,
        fromCache
      ]
    );
  } catch (err) {
    // Non-fatal, just log it
    logger.warn(`[Metrics] DB record failed: ${err.message}`);
  }
}

module.exports = {
  register,
  httpRequestDuration,
  ragQueryDuration,
  vectorSearchDuration,
  llmTokensTotal,
  ingestionStatusTotal,
  metricsMiddleware,
  getMetrics,
  recordQueryMetrics
};