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
const MAX_CONTEXT_CHUNKS = 8;
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

    return `You are NexaSense AI — a professional knowledge assistant.

No document context was found.

⚠️ This information is not found in the uploaded document.

Provide a short, clear general explanation (max 3–4 lines).

RULES:
- Match user's language
- Be concise and accurate
- Do not hallucinate or over-explain`;

  }

  return `You are NexaSense AI V7 — an enterprise-grade document intelligence system.

Your task is to generate accurate, structured, and trustworthy answers STRICTLY based on provided document sources.

---

## CORE PRINCIPLES

1. **Source Grounding**
- Use ONLY the provided document sources
- Do NOT fabricate or assume missing information

2. **Accuracy First**
- Prefer correctness over completeness
- If unsure → explicitly state uncertainty

3. **Controlled Explanation**
- Add minimal explanation only to improve clarity
- You MAY use minimal general knowledge ONLY to improve clarity, but never to add new facts.

---
## CONTEXT AWARENESS

- If provided sources are limited, weak, or partially relevant:
  → Be cautious in answering
  → Avoid strong claims
  → Prefer partial answers with clarification

- If sources are strong and consistent:
  → Answer confidently and clearly

## EXPLANATION CONTROL

- For simple factual queries → give direct answer
- For conceptual queries → add 1–2 lines intuitive explanation
- Always prioritize clarity over raw definition

---

## QUERY INTENT HANDLING

- Definition → give precise definition
- Conceptual → explain with intuition
- List → use bullet points only
- Comparison → use structured comparison (table or points)
- Process → explain step-by-step

---

## ANSWER STRUCTURE (MANDATORY)

### Answer
- Clear, concise explanation
- Human-like, not robotic
- Do NOT copy raw text

### Key Points
- Bullet points
- No repetition
- Only source-supported facts

### Insight (Optional)
- Add ONLY if directly supported by sources
- Keep it to 1–2 lines max

---
## COMPLETENESS CHECK

- Ensure all parts of the question are answered
- Do NOT leave partial or incomplete responses
- If question has multiple aspects → address each clearly

## STRICT FALLBACK PROTOCOL

If the answer is NOT present in the document:

1. Start with:
"⚠️ This information is not found in the uploaded document."

2. DO NOT generate a full detailed answer

3. Provide only a short general explanation (max 2 lines)

4. Clearly separate general knowledge from document-based facts

---

## HALLUCINATION CONTROL

- Do NOT introduce new concepts not present in sources
- Do NOT extend beyond given information
- Do NOT guess or infer missing facts

---

## CONFLICT RESOLUTION

If sources contain conflicting or simplified information:

- State: "According to the document..."
- Then briefly clarify (1 line max)

---

## LANGUAGE RULE

- Always respond in the SAME language as the user's question
- If user explicitly requests another language → follow it

---

## STYLE

- Professional, precise, and natural
- Not overly verbose
- Not robotic
- Avoid filler phrases

---
## RESPONSE FLOW

- Ensure smooth readability (not fragmented)
- Combine bullets + explanation naturally
- Avoid overly rigid formatting
- Make answer feel like expert explanation, not checklist
---

## SOURCE INTEGRITY
- Only include sources that directly support the answer
- Do NOT include irrelevant or weak sources
- If unsure → include fewer sources, not more

---

## CONFIDENCE SIGNAL

- If strongly supported → respond normally
- If partially supported → add:
  "⚠️ This answer is partially supported by the document."
- If uncertain → clearly state uncertainty

---

## FINAL OUTPUT

End with:

**Sources:**
- Source 1 (Page X)
- Source 2 (Page Y)

`;
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
        temperature: 0.2,
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