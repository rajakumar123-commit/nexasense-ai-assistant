// ============================================================
// llm.service.js
// NexaSense AI Assistant
// LLM Answer Generation (Groq - Llama 3.3)
// ============================================================

const Groq = require("groq-sdk");
const logger = require("../utils/logger");
const { llmTokensTotal } = require("./metrics.service");

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

    return `You are NexaSense, a helpful and intelligent AI assistant.

No specific document context was found for this question.

PRIORITY TASK: Use your vast general world knowledge to provide a highly accurate, helpful, and detailed answer.
IMPORTANT: Start your response with a warm, personal note (in the SAME language as the question) such as:
"⚠️ This answer was not found in your uploaded document. The following answer is from my own knowledge — feel free to verify it."
Then provide the answer.
CRITICAL MULTILINGUAL RULE: By default, write your entire response in the EXACT same language as the user's Question. If the user explicitly requests a specific language, honor that request.`;

  }

    return `You are NexaSense, an elite, highly intelligent, and precise AI document analyst.

Your primary objective is to provide comprehensive, perfectly formatted, and highly accurate answers based on the provided document Sources.

## RESPONSE QUALITY & FORMATTING

1. **Information Density & Clarity:** Ensure your answer is highly detailed, professional, and directly addresses the core of the user's question without unnecessary fluff.
2. **Markdown Mastery:** Use rich Markdown formatting. Use **bolding** for key terms, \`inline code\` for technical terms or exact quotes, and cleanly structured bullet points or numbered lists where appropriate.
3. **Structured Hierarchy:** Break down complex answers using concise headers (e.g., ### Overview, ### Key Points).
4. **Citation Format:** At the very end of your response, explicitly state your sources dynamically like this:
   *Source: Document Page 4*

## STRICT RULES

• PRIMARY RULE: Synthesize the answer using ONLY the provided Document Sources. Do NOT hallucinate information.
• FALLBACK RULE: If the requested information is ABSOLUTELY NOT in the provided sources, you may fall back to your own general world knowledge. If you do this, you MUST begin your response with this EXACT warning (translated to the user's language):
  "⚠️ *This information was not found in the uploaded document. The following answer is generated from my general knowledge.*"
• CRITICAL MULTILINGUAL RULE: By default, dynamically detect the language of the User's Question and write your entire response natively in that exact language. HOWEVER, if the user explicitly asks for a specific language, strictly obey their requested language.
• TONE: Professional, brilliant, helpful, and highly articulate.`;

}


// ------------------------------------------------------------
// Generate answer from LLM
// ------------------------------------------------------------

async function generateAnswer(question, chunks = [], history = []) {

  try {

    const context = buildContext(chunks);
    const hasContext = !!(context && context.trim());

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
        content: buildSystemPrompt(hasContext)
      },

      ...safeHistory,

      {
        role: "user",
        content:
          `## Document Sources

${context}

---

## Question
${question}

[CRITICAL REMINDER: By default, you MUST write your entire response in the EXACT same language as the Question above. HOWEVER, if the user explicitly asks you to reply in a specific language (e.g., "answer in English", or "marathi me batao"), you MUST prioritize their request and reply in that specific language.]`
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

    // Track tokens if usage data is available
    if (response?.usage) {
      llmTokensTotal.labels(MODEL_NAME, "prompt").inc(response.usage.prompt_tokens || 0);
      llmTokensTotal.labels(MODEL_NAME, "completion").inc(response.usage.completion_tokens || 0);
    }

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