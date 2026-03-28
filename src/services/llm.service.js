// ============================================================
// llm.service.js
// NexaSense AI Assistant — V5.1 Ultimate
// Hybrid: V7 Reasoning + True Native LLM Streaming
// ============================================================

"use strict";

const Groq = require("groq-sdk");
const logger = require("../utils/logger");
const { llmTokensTotal } = require("./metrics.service");

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
    _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _client;
}

const MODEL_NAME = "llama-3.3-70b-versatile";
const MAX_CONTEXT_CHUNKS = 10; 
const MAX_HISTORY_MSGS = 8;
const MAX_TOKENS = 1500;

// ============================================================
// HELPERS — Build Context with Semantic Awareness
// ============================================================

function buildContext(chunks = []) {
  if (!chunks.length) return null;

  return chunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((chunk, i) => {
      const content = (chunk.content || "").trim();
      
      const categoryMatch = content.match(/^\[Category: (\w+)\]/);
      const category = categoryMatch ? ` | Type: ${categoryMatch[1]}` : "";
      
      const page = chunk.metadata?.pageNumber ? ` | Page ${chunk.metadata.pageNumber}` : "";
      const score = chunk.similarity ? ` | Relevance: ${(chunk.similarity * 100).toFixed(0)}%` : "";

      const cleanContent = content.replace(/^\[Category: \w+\]\s*/, "");

      return `[[SOURCE ${i + 1}${category}${page}${score}]]\n${cleanContent}`;
    })
    .join("\n\n---\n\n");
}

// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(hasContext) {
  if (!hasContext) {
    return `You are NexaSense AI — a professional knowledge assistant.
No document context was found.
⚠️ This information is not found in the uploaded document.
Provide a short, clear general explanation (max 3–4 lines).
RULES: Match language, be concise, do not hallucinate.`;
  }

  return `You are NexaSense AI V7 — an enterprise-grade document intelligence system.
Your task is to generate accurate, structured, and trustworthy answers STRICTLY based on provided document sources.

---
## CORE PRINCIPLES
1. **Source Grounding**: Use ONLY provided sources. Pay attention to the "Type" in headers (e.g., CONTACT_INFO) for semantic priority.
2. **Accuracy First**: Prefer correctness over completeness. If unsure → state uncertainty.
3. **Controlled Explanation**: You MAY use minimal general knowledge ONLY to improve clarity, never to add new facts.

---
## CONTEXT AWARENESS
- If sources are weak: Be cautious, avoid strong claims.
- If sources are strong: Answer confidently and clearly.

## ANSWER STRUCTURE (MANDATORY)
### Answer
- Human-like, concise explanation. Do NOT copy raw text.
### Key Points
- Bullet points. Only source-supported facts.
### Insight (Optional)
- Add ONLY if directly supported by sources (1-2 lines max).

## STRICT FALLBACK PROTOCOL
If answer is NOT present:
1. Start with: "⚠️ This information is not found in the uploaded document."
2. Provide only a short general explanation (max 2 lines).

## FINAL OUTPUT
End with:
**Sources:**
- Source 1 (Page X)
- Source 2 (Page Y)`;
}

// ============================================================
// RESILIENCE — Agentic Retries for Production (Standard)
// ============================================================

async function callGroqWithRetry(messages, attempt = 1) {
  try {
    return await getClient().chat.completions.create({
      model: MODEL_NAME,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      top_p: 0.9,
      timeout: 25000, 
    });
  } catch (error) {
    const isRetryable = error.status === 429 || error.status >= 500;
    if (isRetryable && attempt < 3) {
      const delay = attempt * 2000;
      logger.warn(`[LLM] API Issue. Retry ${attempt}/3 in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return callGroqWithRetry(messages, attempt + 1);
    }
    throw error;
  }
}

async function generateAnswer(question, chunks = [], history = []) {
  try {
    const context = buildContext(chunks);
    const hasContext = !!(context && context.trim());

    const safeHistory = (history || [])
      .slice(-MAX_HISTORY_MSGS)
      .filter(m => m?.role && m?.content)
      .map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content)
      }));

    const messages = [
      { role: "system", content: buildSystemPrompt(hasContext) },
      ...safeHistory,
      {
        role: "user",
        content: `## Document Sources\n${context}\n\n---\n## Question\n${question}\n\n[CRITICAL: Reply in the SAME language as the question.]`
      }
    ];

    const response = await callGroqWithRetry(messages);

    if (response?.usage) {
      llmTokensTotal.labels(MODEL_NAME, "prompt").inc(response.usage.prompt_tokens || 0);
      llmTokensTotal.labels(MODEL_NAME, "completion").inc(response.usage.completion_tokens || 0);
    }

    const answer = response?.choices?.[0]?.message?.content?.trim() || "";
    return answer || "The model could not generate an answer.";

  } catch (error) {
    logger.error("[LLM] Generation failed:", error.message);
    if (error.status === 429) throw new Error("Rate limit reached. Please retry shortly.");
    throw new Error("LLM generation failed");
  }
}

// ============================================================
// ✅ NEW: True Streaming Generator
// ============================================================

async function generateAnswerStream(question, chunks = [], history = [], onToken) {
  try {
    const context = buildContext(chunks);
    const hasContext = !!(context && context.trim());

    const safeHistory = (history || [])
      .slice(-MAX_HISTORY_MSGS)
      .filter(m => m?.role && m?.content)
      .map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content)
      }));

    const messages = [
      { role: "system", content: buildSystemPrompt(hasContext) },
      ...safeHistory,
      {
        role: "user",
        content: `## Document Sources\n${context}\n\n---\n## Question\n${question}\n\n[CRITICAL: Reply in the SAME language as the question.]`
      }
    ];

    const stream = await getClient().chat.completions.create({
      model: MODEL_NAME,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      top_p: 0.9,
      stream: true, 
    });

    let fullAnswer = "";
    
    // Pipe tokens out instantly as they arrive
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        fullAnswer += token;
        if (onToken) onToken(token); 
      }
    }

    return fullAnswer || "The model could not generate an answer.";

  } catch (error) {
    logger.error("[LLM Stream] Generation failed:", error.message);
    throw new Error("LLM stream generation failed");
  }
}

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

module.exports = { generateAnswer, generateAnswerStream, buildContext, estimateTokens };