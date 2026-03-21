// ============================================================
// Redis Configuration
// NexaSense AI Assistant
// Used for BullMQ distributed ingestion workers
// FIX: docker-compose sets REDIS_URL — parse it correctly
//      instead of using REDIS_HOST/PORT which are not set.
// ============================================================

const IORedis = require("ioredis");
const logger  = require("../utils/logger");

// Shared options required by BullMQ
const sharedOpts = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  reconnectOnError(err) {
    const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
    return targetErrors.some(e => err.message.includes(e));
  }
};

// Prefer REDIS_URL (set by docker-compose), fall back to host/port
const redisConnection = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, sharedOpts)
  : new IORedis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      ...sharedOpts
    });


// ------------------------------------------------------------
// Connection events
// ------------------------------------------------------------

redisConnection.on("connect", () => {
  logger.info("[Redis] Connected");
});

redisConnection.on("ready", () => {
  logger.info("[Redis] Ready");
});

redisConnection.on("error", (err) => {
  logger.error("[Redis] Error:", err.message);
});

redisConnection.on("close", () => {
  logger.warn("[Redis] Connection closed");
});

module.exports = redisConnection;