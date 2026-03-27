// ============================================================
// queryRewrite.service.js
// NexaSense AI Assistant
// Production-Grade Query Rewrite + HYDE + Expansion
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


// ------------------------------------------------------------
// MAIN QUERY PROCESSOR
// ------------------------------------------------------------
async function processQueryWithGroq(question, history = []) {

  try {

    // ---------------------------------------------------------
    // Context extraction (last 4 messages only)
    // ---------------------------------------------------------
    const context =
      history && history.length > 0
        ? history
            .slice(-4)
            .map(m => `${m.role}: ${m.content}`)
            .join("\n")
        : "None";


    // ---------------------------------------------------------
    // PRODUCTION PROMPT (STRICT + SAFE)
    // ---------------------------------------------------------
    const prompt = `
You are a search query optimizer for an enterprise document retrieval system.

Your goal is to improve retrieval accuracy while minimizing noise.

---

## TASKS

1. Correct spelling and grammar
2. Convert follow-up questions into a standalone query using context
3. Generate up to 3 high-quality search queries
4. Generate a safe hypothetical document (HYDE)

---

## QUERY EXPANSION RULES

- Generate AT MOST 3 queries
- Only include queries that are meaningfully different
- Avoid redundancy or rephrasing the same query
- Keep queries short (max 10–12 words)
- Focus on keywords that improve document retrieval

---

## HYPOTHETICAL DOCUMENT (HYDE)

- 1–2 sentences only
- Must be neutral and generic
- Must NOT introduce specific facts
- Must NOT hallucinate details
- Purpose: guide semantic search, not answer the question

---

## MULTILINGUAL RULE

- Keep "standaloneQuery" in user's original language
- Convert "searchQueries" and "hypotheticalDocument" into English

---

## OUTPUT FORMAT (STRICT JSON ONLY)

{
  "standaloneQuery": "...",
  "searchQueries": ["...", "..."],
  "hypotheticalDocument": "..."
}

---

Conversation context:
${context}

User question:
${question}
`.trim();


    // ---------------------------------------------------------
    // Groq API call
    // ---------------------------------------------------------
    const response = await getClient().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2, // controlled creativity
      max_tokens: 300,
      response_format: { type: "json_object" }
    });


    const content = response?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("Empty response from Groq");
    }


    // ---------------------------------------------------------
    // Safe JSON parsing
    // ---------------------------------------------------------
    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      logger.warn("[QueryRewrite] JSON parse failed, using fallback:", parseErr.message);
      return fallbackResponse(question);
    }


    // ---------------------------------------------------------
    // Safety validation (VERY IMPORTANT)
    // ---------------------------------------------------------
    const standaloneQuery =
      typeof parsed.standaloneQuery === "string" && parsed.standaloneQuery.trim().length > 0
        ? parsed.standaloneQuery.trim()
        : question;

    const searchQueries =
      Array.isArray(parsed.searchQueries)
        ? parsed.searchQueries
            .filter(q => typeof q === "string" && q.trim().length > 2)
            .slice(0, 3)
        : [];

    const hypotheticalDocument =
      typeof parsed.hypotheticalDocument === "string" && parsed.hypotheticalDocument.trim().length > 0
        ? parsed.hypotheticalDocument.trim()
        : question;


    return {
      standaloneQuery,
      searchQueries,
      hypotheticalDocument
    };

  } catch (error) {

    logger.warn("[QueryRewrite] Groq processing failed:", error.message);

    return fallbackResponse(question);

  }

}


// ------------------------------------------------------------
// Fallback (SAFE)
// ------------------------------------------------------------
function fallbackResponse(question) {
  return {
    standaloneQuery: question,
    searchQueries: [],
    hypotheticalDocument: question
  };
}


module.exports = { processQueryWithGroq };