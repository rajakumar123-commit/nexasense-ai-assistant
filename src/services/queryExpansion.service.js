// ============================================================
// Query Expansion Service
// Generates better search queries using Gemini
// ============================================================

const { askGemini } = require("./gemini.service");
const logger        = require("../utils/logger");

// Strip numbered/bulleted list prefixes from LLM output lines
function cleanQuery(line) {
  return line
    .replace(/^\s*(\d+[\.\)]\s*|[-•*]\s*)/, "") // Remove "1. ", "- ", "• "
    .trim();
}

async function expandQuery(question) {

  try {

    const prompt = `
Rewrite the user query into 3 improved search queries for document retrieval.
Fix spelling. Keep the meaning. Return ONLY the 3 queries, one per line, no numbering or bullets.

User Query: ${question}
`;

    const result = await askGemini(prompt);

    if (!result) return [question];

    const queries = result
      .split("\n")
      .map(cleanQuery)
      .filter(q => q.length > 3);

    // Always include the original question as safety net
    const all = [...new Set([...queries.slice(0, 3), question])];

    return all;

  } catch (err) {

    logger.warn("[QueryExpansion] fallback:", err.message);
    return [question];

  }

}

module.exports = { expandQuery };