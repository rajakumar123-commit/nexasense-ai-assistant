// ============================================================
// spellCorrection.service.js
// NexaSense AI Assistant
// Gemini-powered spell correction
// Replaces dictionary/regex approach — handles heavy typos
// ============================================================

const { askGemini } = require("./gemini.service");
const logger = require("../utils/logger");

const MAX_CORRECTION_TIME = 30000; // ms safety timeout


// ------------------------------------------------------------
// Safe Gemini call with timeout
// ------------------------------------------------------------

async function callWithTimeout(prompt) {

  return Promise.race([

    askGemini(prompt),

    new Promise((_, reject) =>
      setTimeout(() =>
        reject(new Error("Spell correction timeout")),
        MAX_CORRECTION_TIME
      )
    )

  ]);

}


// ------------------------------------------------------------
// correctSpelling
// Drop-in replacement — same signature as the original.
// Returns the corrected string, or the original if anything
// goes wrong (never throws).
// ------------------------------------------------------------

async function correctSpelling(query) {

  // Guard: skip empty or very short queries
  if (!query || typeof query !== "string" || query.trim().length < 3) {
    return query;
  }

  try {

    const prompt = `
You are a spell-correction assistant for a document search system.

Correct any spelling mistakes or typos in the user query below.
Return ONLY the corrected query as plain text.
Do NOT explain. Do NOT add punctuation. Do NOT change the meaning.

If the query is already correct, return it exactly as-is.

Query: ${query.trim()}
`.trim();

    const corrected = await callWithTimeout(prompt);

    const result = (corrected || "").trim();

    // Safety: if Gemini returns empty or something wildly longer,
    // fall back to the original query
    if (!result || result.length > query.length * 3) {
      return query;
    }

    return result;

  } catch (err) {

    logger.warn("[SpellCorrection] skipped:", err.message);

    // Always fall back to original — never break the pipeline
    return query;

  }

}


module.exports = { correctSpelling };