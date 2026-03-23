// ============================================================
// llm.service.js
// NexaSense AI Assistant
// LLM Answer Generation (Groq - Llama 3.3)
// ============================================================

const Groq = require("groq-sdk");
const logger = require("../utils/logger");

// Client is created lazily inside generateAnswer so that
// dotenv.config() has time to run before the key is read.
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

const MODEL_NAME = "llama-3.3-70b-versatile";
const MAX_CONTEXT_CHUNKS = 5;
const MAX_HISTORY_MSGS = 8;
const MAX_TOKENS = 1500;


// ------------------------------------------------------------
// Build context block from retrieved chunks
// ------------------------------------------------------------

function buildContext(chunks = []) {

  if (!chunks.length) return null;

  return chunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((chunk, i) => {

      const page =
        chunk.metadata?.pageNumber
          ? ` | Page ${chunk.metadata.pageNumber}`
          : "";

      const score =
        chunk.similarity
          ? ` | Relevance: ${(chunk.similarity * 100).toFixed(0)}%`
          : "";

      const text = (chunk.content || "").trim();

      return `[Source ${i + 1}${page}${score}]\n${text}`;

    })
    .join("\n\n---\n\n");

}


// ------------------------------------------------------------
// System prompt
// ------------------------------------------------------------

function buildSystemPrompt(hasContext) {

  if (!hasContext) {

    return `You are NexaSense, an AI document assistant.

No document context is available for this question.

Respond exactly:
"This information is not available in the uploaded document."

Do not use outside knowledge.`;

  }

  return `You are NexaSense, a precise and reliable AI document assistant.

You must answer questions using ONLY the provided document Sources.

## RESPONSE STRUCTURE

1. **Direct Answer**
   Start with a concise direct answer.

2. **Explanation**
   Provide a clear explanation using bullet points or steps.

3. **Source Reference**
   End with "(Based on Source X)" or "(Sources X and Y)".

## STRICT RULES

• Use ONLY the provided Sources  
• Never invent facts  
• If the answer is missing, respond:

"This specific information is not covered in the document."

• Maintain awareness of previous conversation context  
• Avoid repeating information unnecessarily`;

}


// ------------------------------------------------------------
// Generate answer from LLM
// ------------------------------------------------------------

async function generateAnswer(question, chunks = [], history = []) {

  try {

    if (!chunks || chunks.length === 0) {

      return "This information is not available in the uploaded document.";

    }

    const context = buildContext(chunks);

    const safeHistory =
      (history || [])
        .slice(-MAX_HISTORY_MSGS)
        .filter(m => m?.role && m?.content)
        .map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content)
        }));

    const messages = [

      {
        role: "system",
        content: buildSystemPrompt(true)
      },

      ...safeHistory,

      {
        role: "user",
        content:
          `## Document Sources

${context}

---

## Question
${question}`
      }

    ];


    const response =
      await getClient().chat.completions.create({

        model: MODEL_NAME,

        messages,

        max_tokens: MAX_TOKENS,

        temperature: 0.15,
        top_p: 0.9,
        frequency_penalty: 0.1

      });


    const answer =
      response?.choices?.[0]?.message?.content?.trim() || "";

    if (!answer) {

      return "The model could not generate an answer from the document.";

    }

    return answer;

  }

  catch (error) {

    logger.error("[LLM] Generation failed:", error.message);

    if (error.message?.includes("rate_limit")) {
      throw new Error("LLM rate limit reached — please retry shortly.");
    }

    if (error.message?.includes("context_length")) {
      throw new Error("Context too large — try a more specific question.");
    }

    throw new Error("LLM generation failed");

  }

}


// ------------------------------------------------------------
// Token estimate (used for metrics)
// ------------------------------------------------------------

function estimateTokens(text) {

  const str = String(text || "");

  return Math.ceil(str.length / 4);

}


module.exports = {
  generateAnswer,
  buildContext,
  estimateTokens
};