require("dotenv").config();

const app  = require("./app");
const { pool } = require("./db");
const logger = require("./utils/logger");

const PORT = process.env.PORT || 3000;


// ============================================================
// Process-level crash guards
// ONNX/WASM runtime fires background errors after embedding
// model completes. Without these handlers the process exits,
// Docker restarts it, and users get 502 Bad Gateway.
// ============================================================

process.on("uncaughtException", (err) => {
  const msg = err?.message || "";
  // Suppress non-fatal ONNX/WASM internal errors
  if (msg.includes("onnxruntime") ||
      msg.includes("DefaultLogger") ||
      msg.includes("blob:")) {
    logger.warn("[Server] Non-fatal ONNX background error (ignored):", msg);
    return;
  }
  logger.error("[Server] Uncaught exception — exiting:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason?.message || String(reason);
  if (msg.includes("onnxruntime") ||
      msg.includes("DefaultLogger") ||
      msg.includes("blob:")) {
    logger.warn("[Server] Non-fatal ONNX unhandled rejection (ignored):", msg);
    return;
  }
  logger.error("[Server] Unhandled rejection:", reason);
});


// ============================================================
// Start
// ============================================================

async function startServer() {

  // Verify DB is ready before accepting traffic
  try {
    await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL connected and healthy");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }

  // Pre-warm embedder before accepting HTTP connections to avoid ONNX native threading collisions
  try {
    const embed = require("./services/sharedEmbedder");
    console.log("⏳ Pre-warming embedder model...");
    await embed.embedSingle("warmup");
    console.log("✅ Embedder model warmed up safely!");
  } catch (err) {
    console.error("❌ Failed to pre-warm embedder:", err);
  }

  app.listen(PORT, () => {
    console.log(`🚀 NexaSense running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  }).on("error", (err) => {
    console.error("❌ Server failed to start:", err.message);
    process.exit(1);
  });

}

startServer();