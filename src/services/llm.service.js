const Groq = require("groq-sdk");

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL_NAME         = "llama-3.3-70b-versatile";
const MAX_CONTEXT_CHUNKS = 5;
const MAX_HISTORY_MSGS   = 8;   // last 4 Q&A pairs
const MAX_TOKENS         = 1500;

// ─────────────────────────────────────────────────────────────
// Build rich context with page numbers and relevance scores
// ─────────────────────────────────────────────────────────────
function buildContext(chunks = []) {
  if (!chunks.length) return null;

  return chunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((chunk, i) => {
      const page  = chunk.metadata?.pageNumber ? ` | Page ${chunk.metadata.pageNumber}` : "";
      const score = chunk.similarity           ? ` | Relevance: ${(chunk.similarity * 100).toFixed(0)}%` : "";
      return `[Source ${i + 1}${page}${score}]\n${chunk.content.trim()}`;
    })
    .join("\n\n---\n\n");
}

// ─────────────────────────────────────────────────────────────
// Industry-grade system prompt
// Goals:
//   1. Structured, readable answers (like Gemini)
//   2. Zero hallucination — only document context
//   3. Conversation-aware (handles follow-ups)
//   4. Transparent sourcing
// ─────────────────────────────────────────────────────────────
function buildSystemPrompt(hasContext) {
  if (!hasContext) {
    return `You are NexaSense, an AI document assistant.
No document context is available for this question.
Respond: "This information is not available in the uploaded document."
Do not use any outside knowledge.`;
  }

  return `You are NexaSense, a precise and helpful AI document assistant.

## YOUR CAPABILITIES
- Answer questions using ONLY the document Sources provided
- Maintain conversation context for follow-up questions
- Provide structured, clear, well-formatted answers

## ANSWER FORMAT
Structure your answers like this:
1. **Direct Answer** — Start with a concise direct answer (1-2 sentences)
2. **Explanation** — Provide detailed explanation with bullet points or numbered steps when helpful
3. **Source Reference** — End with "*(Based on Source X)*" or "*(Sources X and Y)*"

## STRICT RULES
1. Use ONLY information from the provided Sources — never use outside knowledge
2. If the answer is NOT in the Sources, say exactly:
   "This specific information is not covered in the document. The document discusses [brief summary of what IS there]."
3. For follow-up questions ("explain more", "what about X"), refer back to previous conversation context
4. Use bullet points for lists, numbered steps for processes, bold for key terms
5. Never repeat yourself — be concise but complete
6. If a question is vague, answer the most likely interpretation and note your assumption

## CONVERSATION AWARENESS
- Previous messages give you context about what was already discussed
- "it", "that", "this" in follow-ups refer to the last discussed topic
- If the user asks "why?", "how?" — they want deeper explanation of your last answer`;
}

// ─────────────────────────────────────────────────────────────
// Main answer generation
// ─────────────────────────────────────────────────────────────
async function generateAnswer(question, chunks = [], history = []) {
  try {
    const context = buildContext(chunks);

    // Trim history to last N messages (keep token usage low)
    const recentHistory = history
      .slice(-MAX_HISTORY_MSGS)
      .map(m => ({ role: m.role, content: m.content }));

    const messages = [
      {
        role:    "system",
        content: buildSystemPrompt(!!context)
      },
      // Previous conversation turns
      ...recentHistory,
      // Current question — inject context here (not in system) for better grounding
      {
        role:    "user",
        content: context
          ? `## Document Sources\n\n${context}\n\n---\n\n## Question\n${question}`
          : question
      }
    ];
const response = await client.chat.completions.create({
  model: MODEL_NAME,
  messages,
  max_tokens: MAX_TOKENS,
  temperature: 0.15,
  top_p: 0.9,
  frequency_penalty: 0.1
});

    const answer = response.choices[0].message.content.trim();

    // Safety net: if model somehow answered without context, override
    if (!context && !answer.toLowerCase().includes("not available") && !answer.toLowerCase().includes("not covered")) {
      return "This information is not available in the uploaded document.";
    }

    return answer;

  } catch (error) {
    console.error("[LLM] Generation failed:", error.message);

    // Provide graceful degradation instead of crash
    if (error.message.includes("rate_limit")) {
      throw new Error("LLM rate limit reached — please wait a moment and try again.");
    }
    if (error.message.includes("context_length")) {
      throw new Error("Question context too long — please ask a more specific question.");
    }
    throw new Error(`LLM generation failed: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Estimate token count (rough — 1 token ≈ 4 chars)
// ─────────────────────────────────────────────────────────────
function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

module.exports = { generateAnswer, buildContext, estimateTokens };