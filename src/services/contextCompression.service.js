// ============================================================
// contextCompression.service.js
// NexaSense AI Assistant
// Compress retrieved context before sending to LLM
// Safe version (no external LLM dependency)
// FIX: Replaced console.error with logger
// ============================================================

const logger = require("../utils/logger");

// ------------------------------------------------------------
// Clean single chunk
// Gently removes excess whitespace without destroying semantic meaning
// ------------------------------------------------------------
function compressChunk(query, chunkText) {
  if (!chunkText) return "";
  // Safe cleanup: collapse multiple spaces/newlines
  return chunkText.replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------
// Pass-through context cleaner
// ------------------------------------------------------------
async function compressContext(query, chunks = []) {
  try {
    if (!chunks.length) return [];
    
    // Instead of destroying sentences, we just clean the formatting.
    // Llama 3.3 and Gemini 1.5 Pro are excellent at long-context reasoning.
    return chunks.map(chunk => ({
        ...chunk,
        content: compressChunk(query, chunk.content)
    }));
  } catch (error) {
    logger.error("[ContextCompression] failed:", error.message);
    return chunks;
  }
}

module.exports = {
  compressContext
};