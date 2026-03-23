// ============================================================
// queryRewrite.service.js
// NexaSense AI Assistant
// FIX: Create Groq client lazily (inside function) so that
//      dotenv.config() has time to run before reading GROQ_API_KEY.
//      The original code created the client at module load time
//      which meant process.env.GROQ_API_KEY was undefined.
// FIX: Replaced console.warn with logger
// ============================================================

const Groq = require("groq-sdk");
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


async function processQueryWithGroq(question, history = []) {

  try {
    const context = history && history.length > 0
      ? history.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n")
      : "None";

    const prompt = `
You are a search query optimizer for a document retrieval system.
Perform 4 low-complexity tasks on the user's question:
1. Fix any spelling grammar mistakes.
2. If the question is a follow-up (e.g. "what is it?"), use the conversation context to make it a standalone search query.
3. Generate 3 alternative keyword phrases (query expansion) to maximize database retrieval.
4. Generate a 'hypotheticalDocument': a realistic 1-2 sentence excerpt that would perfectly answer the user's question.

Output STRICTLY in valid JSON format ONLY. No markdown blocks, no explanation.
{
  "standaloneQuery": "The corrected, context-resolved question",
  "searchQueries": ["alt phrase 1", "alt phrase 2", "alt phrase 3"],
  "hypotheticalDocument": "A realistic excerpt answering the query..."
}

Conversation context:
${context}

User question:
${question}
`.trim();

    const response = await getClient().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2, // slightly higher temp for better hypothetical generation
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    const content = response?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response from Groq");

    const parsed = JSON.parse(content);

    return {
      standaloneQuery: parsed.standaloneQuery || question,
      searchQueries: Array.isArray(parsed.searchQueries) ? parsed.searchQueries : [],
      hypotheticalDocument: parsed.hypotheticalDocument || question
    };

  } catch (error) {
    logger.warn("[QueryProcessor] Groq JSON processing failed:", error.message);
    return {
      standaloneQuery: question,
      searchQueries: [],
      hypotheticalDocument: question
    };
  }

}

module.exports = { processQueryWithGroq };