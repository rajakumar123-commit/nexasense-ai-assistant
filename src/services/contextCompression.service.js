// ============================================================
// contextCompression.service.js
// NexaSense AI Assistant
// Compress retrieved context before sending to LLM
// Safe version (no external LLM dependency)
// FIX: Replaced console.error with logger
// ============================================================

const logger = require("../utils/logger");

// ------------------------------------------------------------
// Compress single chunk
// Simple heuristic compression
// ------------------------------------------------------------
function compressChunk(query, chunkText) {

  if (!chunkText) return "";

  const sentences = chunkText.split(/(?<=\.|\?|!)\s+/);

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);

  const filtered = sentences.filter(sentence => {

    const lower = sentence.toLowerCase();

    return queryWords.some(word => lower.includes(word));

  });

  const compressed = filtered.join(" ");

  // Only use compressed version if it has meaningful content.
  // Empty or very short results indicate over-filtering — fall back
  // to the first 500 chars of the original text instead.
  const MIN_COMPRESSED_LENGTH = 100;

  if (compressed.length < MIN_COMPRESSED_LENGTH) {
    return chunkText.slice(0, 600);
  }

  return compressed;

}


// ------------------------------------------------------------
// Compress multiple chunks
// ------------------------------------------------------------
async function compressContext(query, chunks = []) {

  try {

    if (!chunks.length) return [];

    const compressedChunks = chunks.map(chunk => {

      const compressedText =
        compressChunk(query, chunk.content);

      return {
        ...chunk,
        content: compressedText
      };

    });

    return compressedChunks;

  } catch (error) {

    logger.error(
      "[ContextCompression] failed:",
      error.message
    );

    return chunks;

  }

}


module.exports = {
  compressContext
};