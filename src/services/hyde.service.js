// ============================================================
// hyde.service.js
// NexaSense AI Assistant
// HyDE: Hypothetical Document Embeddings
// FIX: Uses sharedEmbedder instead of its own model instance
// FIX: Replaced console.warn/error with logger
// ============================================================

const { embedSingle } = require("./sharedEmbedder");
const logger          = require("../utils/logger");


// ------------------------------------------------------------
// Generate hypothetical document using Groq LLM
// Returns original query as fallback if LLM call fails.
// ------------------------------------------------------------

async function generateHypotheticalDocument(query) {
  try {

    const Groq = require("groq-sdk");
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const response = await client.chat.completions.create({
      model:       "llama-3.3-70b-versatile",
      max_tokens:  150,
      temperature: 0.3,
      messages: [
        {
          role:    "system",
          content: "You are a document assistant. Write a realistic 2-3 sentence " +
                   "excerpt from a document that would perfectly answer the given question."
        },
        { role: "user", content: query }
      ]
    });

    const hypothetical = response?.choices?.[0]?.message?.content?.trim();
    return hypothetical || query;

  } catch (err) {
    logger.warn("[HyDE] LLM generation failed, using raw query:", err.message);
    return query;
  }
}


// ------------------------------------------------------------
// Create embedding for hypothetical document
// ------------------------------------------------------------

async function generateHyDEEmbedding(query) {
  try {
    const hypotheticalDoc = await generateHypotheticalDocument(query);
    const embedding       = await embedSingle(hypotheticalDoc);
    return { embedding, hypotheticalDoc };
  } catch (err) {
    logger.error("[HyDE] embedding failed:", err.message);
    throw err;
  }
}


// ------------------------------------------------------------
// Main entry — called by retrieval.pipeline.js
// Returns { embedding, hypotheticalDoc }
// On failure returns { embedding: null, hypotheticalDoc: query }
// ------------------------------------------------------------

async function hydeSearchVector(query) {
  try {
    const { embedding, hypotheticalDoc } = await generateHyDEEmbedding(query);
    return { embedding, hypotheticalDoc };
  } catch (err) {
    logger.error("[HyDE] search failed:", err.message);
    return { embedding: null, hypotheticalDoc: query };
  }
}


module.exports = {
  hydeSearchVector,
  generateHyDEEmbedding,
  generateHypotheticalDocument
};