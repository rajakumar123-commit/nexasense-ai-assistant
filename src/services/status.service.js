// ============================================================
// Status Service
// NexaSense AI Assistant
// Provides system health monitoring
// ============================================================

const db = require("../db");
const logger = require("../utils/logger");
const http = require("http");


// ─────────────────────────────────────────
// Check PostgreSQL status
// ─────────────────────────────────────────
async function checkDatabase() {

  try {

    await db.query("SELECT 1");

    return {
      service: "postgres",
      status: "healthy"
    };

  } catch (error) {

    logger.error("[Status] PostgreSQL check failed:", error.message);

    return {
      service: "postgres",
      status: "unhealthy",
      error: error.message
    };

  }

}


// ─────────────────────────────────────────
// Check ChromaDB status
// ─────────────────────────────────────────
function checkChroma() {

  return new Promise((resolve) => {

    const chromaBase = process.env.CHROMA_URL || "http://localhost:8000";
    const req = http.get(
      `${chromaBase}/api/v2/heartbeat`,
      (res) => {

        if (res.statusCode === 200) {

          resolve({
            service: "chroma",
            status: "healthy"
          });

        } else {

          resolve({
            service: "chroma",
            status: "unhealthy",
            code: res.statusCode
          });

        }

      }
    );

    req.on("error", (error) => {

      logger.error("[Status] Chroma check failed:", error.message);

      resolve({
        service: "chroma",
        status: "unhealthy",
        error: error.message
      });

    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve({
        service: "chroma",
        status: "timeout"
      });
    });

  });

}


// ─────────────────────────────────────────
// System status aggregator
// ─────────────────────────────────────────
async function getSystemStatus() {

  try {

    const dbStatus = await checkDatabase();
    const chromaStatus = await checkChroma();

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      services: {
        database: dbStatus,
        chroma: chromaStatus
      }
    };

  } catch (error) {

    logger.error("[Status] System status error:", error.message);

    return {
      status: "error",
      error: error.message
    };

  }

}


// ─────────────────────────────────────────

module.exports = {
  getSystemStatus
};