// ============================================================
// queryRewrite.service.js
// NexaSense AI Assistant
// FIX: Create Groq client lazily (inside function) so that
//      dotenv.config() has time to run before reading GROQ_API_KEY.
//      The original code created the client at module load time
//      which meant process.env.GROQ_API_KEY was undefined.
// FIX: Replaced console.warn with logger
// ============================================================

const Groq   = require("groq-sdk");
const logger = require("../utils/logger");

let _client = null;

function getClient() {
  if (!_client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }
    _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _client;
}


async function rewriteQuery(question, history = []) {

  try {

    // If no conversation history → return original question unchanged
    if (!history || history.length === 0) {
      return question;
    }

    const context = history
      .slice(-4)
      .map(m => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `
Rewrite the user's question into ONE optimized search query
for retrieving relevant document passages.

Conversation context:
${context}

User question:
${question}

Return ONLY the rewritten query.
`;

    const response = await getClient().chat.completions.create({
      model:       "llama-3.3-70b-versatile",
      messages:    [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens:  60
    });

    const rewritten = response?.choices?.[0]?.message?.content?.trim();
    return rewritten || question;

  } catch (error) {

    logger.warn("[QueryRewrite] failed:", error.message);
    return question;

  }

}


module.exports = { rewriteQuery };