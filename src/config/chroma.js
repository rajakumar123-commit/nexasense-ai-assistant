// ============================================================
// Chroma Client
// NexaSense AI Assistant
// FIX: chromadb v3 no longer accepts { path: "..." }.
//      Parse CHROMA_URL into host+port separately.
// ============================================================

const { ChromaClient } = require("chromadb");

// Parse "http://chroma:8000" → { host: "chroma", port: 8000 }
function parseChromaUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 8000
    };
  } catch {
    return { host: "chroma", port: 8000 };
  }
}

const { host, port } = parseChromaUrl(
  process.env.CHROMA_URL || "http://chroma:8000"
);

const chroma = new ChromaClient({ host, port });

module.exports = chroma;