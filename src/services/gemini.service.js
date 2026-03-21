// ============================================================
// gemini.service.js
// NexaSense AI Assistant
// Low-level Gemini client with retry on rate limit
// ============================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../utils/logger");

let model = null;


// ------------------------------------------------------------
// Initialize Gemini model (singleton)
// Reset on failure so next call retries fresh
// ------------------------------------------------------------
function getModel() {

  if (model) return model;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  try {

    const genAI = new GoogleGenerativeAI(apiKey);

    model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite"
    });

    return model;

  } catch (err) {

    model = null; // reset so next call retries
    logger.error("[Gemini] Initialization failed:", err.message);
    throw err;

  }

}


// ------------------------------------------------------------
// Sleep helper
// ------------------------------------------------------------
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}


// ------------------------------------------------------------
// Execute Gemini prompt
// Retries up to 3 times on 429 with exponential backoff
// ------------------------------------------------------------
async function askGemini(prompt, retries = 3) {

  if (!prompt || typeof prompt !== "string") {
    throw new Error("Invalid Gemini prompt");
  }

  for (let attempt = 1; attempt <= retries; attempt++) {

    try {

      const m      = getModel();
      const result = await m.generateContent(prompt);
      const resp   = result?.response;

      if (!resp) throw new Error("Empty Gemini response");

      const text = resp.text();

      if (!text?.trim()) throw new Error("Gemini returned empty text");

      return text.trim();

    } catch (error) {

      const is429 = error.status === 429 ||
                    error.message?.includes("429") ||
                    error.message?.includes("Too Many Requests");

      // On 429 — wait and retry
      if (is429 && attempt < retries) {
        const waitMs = attempt * 5000; // 5s, 10s
        logger.warn(`[Gemini] Rate limited — retrying in ${waitMs/1000}s (attempt ${attempt}/${retries})`);
        await sleep(waitMs);
        continue;
      }

      // On 401/404 — reset singleton so next call gets fresh model
      if (error.status === 401 || error.status === 404) {
        model = null;
      }

      logger.warn("[Gemini] request failed:", error.message);
      throw error;

    }

  }

}


module.exports = {
  askGemini
};