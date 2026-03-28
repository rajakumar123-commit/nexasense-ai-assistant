// ============================================================
// llm.service.js — NexaSense AI Enterprise V7.0
//
// WHAT'S NEW vs V6.0:
//   ✅ buildContext uses ALL real metadata fields from worker
//   ✅ Role-aware answer strategy (FAQ vs PRODUCT_DETAIL vs LEGAL etc.)
//   ✅ Question placed BEFORE context (better LLM attention)
//   ✅ Token budget guard — prevents silent context overflow
//   ✅ temperature dropped to 0.05 — faithful extraction
//   ✅ MAX_TOKENS raised to 2400 — no truncated list answers
//   ✅ MAX_CONTEXT_CHUNKS raised to 12
//   ✅ Stream retry + error token on failure
//   ✅ Retry whitelist — only retriable status codes retried
// ============================================================

"use strict";

const Groq   = require("groq-sdk");
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

const MODEL_NAME         = "llama-3.3-70b-versatile";
const MAX_CONTEXT_CHUNKS = 12;    // was 10
const MAX_HISTORY_MSGS   = 6;     // was 8 — free token budget for answer
const MAX_TOKENS         = 2400;  // was 1800 — room for complete list answers
const MAX_CONTEXT_CHARS  = 24000; // ~6000 tokens — prevents context overflow

// Only these status codes are worth retrying
const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// ─────────────────────────────────────────────────────────────
// LANGUAGE MAP
// ─────────────────────────────────────────────────────────────

const LANG_MAP = {
  en: "English", hi: "Hindi",    bn: "Bengali",    ar: "Arabic",
  fr: "French",  es: "Spanish",  de: "German",     ta: "Tamil",
  te: "Telugu",  mr: "Marathi",  gu: "Gujarati",   pa: "Punjabi",
  ur: "Urdu",    zh: "Chinese",  ja: "Japanese",   ko: "Korean",
  ru: "Russian", pt: "Portuguese",
};

// ─────────────────────────────────────────────────────────────
// BUILD CONTEXT
// Uses every real metadata field your worker produces
// ─────────────────────────────────────────────────────────────

function buildContext(chunks = []) {
  if (!chunks.length) return null;

  let totalChars = 0;
  const selected = [];

  for (const chunk of chunks.slice(0, MAX_CONTEXT_CHUNKS)) {
    const raw     = typeof chunk === "string" ? chunk : (chunk.content || "");
    const content = raw.trim();
    if (!content) continue;

    // Token budget guard — truncate rather than drop
    if (totalChars + content.length > MAX_CONTEXT_CHARS) {
      const remaining = MAX_CONTEXT_CHARS - totalChars;
      if (remaining > 300) {
        selected.push({
          ...chunk,
          content: content.slice(0, remaining) + "\n[chunk truncated — token limit]",
        });
      }
      break;
    }

    selected.push({ ...chunk, content });
    totalChars += content.length;
  }

  if (!selected.length) return null;

  return selected.map((chunk, i) => {
    // Every field your worker actually writes
    const role    = chunk?.metadata?.role       || chunk?.role        || null;
    const page    = chunk?.metadata?.page       || chunk?.metadata?.pageNumber || null;
    const words   = chunk?.metadata?.words                            || null;
    const source  = chunk?.metadata?.source                          || null;
    const heading = chunk?.metadata?.heading                         || null;
    const score   = chunk?.similarity != null
      ? `${(chunk.similarity * 100).toFixed(0)}%` : null;

    const meta = [
      role    ? `Type: ${role}`         : null,
      heading ? `Section: ${heading}`   : null,
      page    ? `Page: ${page}`         : null,
      words   ? `Words: ${words}`       : null,
      score   ? `Relevance: ${score}`   : null,
      source  ? `Source: ${source}`     : null,
    ].filter(Boolean).join(" | ");

    return `┌── Chunk ${i + 1}${meta ? ` — ${meta}` : ""}\n${chunk.content}\n└──`;
  }).join("\n\n");
}

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────

function buildSystemPrompt(hasContext, detectedLanguage = "en") {
  const langName = LANG_MAP[detectedLanguage] || detectedLanguage.toUpperCase();

  if (!hasContext) {
    return `You are a professional document assistant.
No document context was retrieved for this question.
Start your reply with: "I couldn't find this in the uploaded document. From my general knowledge:"
Reply entirely in ${langName}.
Technical terms, codes, and proper nouns stay in English.
Be concise and accurate. Do not hallucinate.`;
  }

  return `You are an intelligent, precise document assistant.
Answer questions strictly from the context chunks provided.
You have no memory beyond what is in the conversation history provided.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — GROUNDING & ACCURACY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

G1 — SOURCE FIDELITY
Use only the provided chunks. Never add outside knowledge, assumptions, or training data.

G2 — PARTIAL INFORMATION
If context partially covers the question:
  → Give what you found.
  → Add: "The document may have more detail — try asking specifically about [X]."
Never present partial information as a complete answer.

G3 — WEAK MATCH
If chunks are loosely related but don't directly answer:
  → Say: "I found related content but it may not fully answer your question:"
  → Share the relevant part.
  → Never pretend a tangential chunk is a direct answer.

G4 — TRUE ABSENCE
Say "I couldn't find this in the document" ONLY after scanning every chunk and finding nothing relevant.
Never use it as a shortcut when chunks exist but are complex to read.

G5 — STRUCTURED DATA
When a chunk contains a table, matrix, numbered list, or form:
  → Read the entire structure before answering.
  → Extract the exact row, column, or cell that answers the question.
  → Reproduce structured data accurately — do not paraphrase or summarise it.

G6 — MULTI-CHUNK SYNTHESIS
Never answer from only the first relevant chunk.
Scan ALL chunks → collect every contributing piece → synthesize into one complete response.

G7 — NAVIGATION NOISE
Chunks that contain only headings, page numbers, or index entries have no answer content.
Skip them. A valid chunk has actual body text.

G8 — ROLE-AWARE READING
Each chunk has a Type label. Use it to find the right chunk faster:
  FAQ            → definitions, how-to answers, common questions
  CONTACT_INFO   → phone numbers, emails, addresses, locations
  SERVICE_DESC   → what a product or service does, features, capabilities
  PRODUCT_DETAIL → prices, specs, dimensions, SKUs, codes
  TESTIMONIAL    → reviews, ratings, customer quotes
  LEGAL_FOOTER   → terms, policies, disclaimers, copyright
  GENERAL_CONTENT→ everything else — read carefully for the relevant section

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — FORMAT — MATCH TO QUESTION TYPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LIST QUESTIONS — "what are / list / give all / name all / mention all"
  → Numbered or bulleted list.
  → Group by categories present in the document — never invent groupings.
  → Include identifiers (codes, IDs, clause numbers, reference numbers) when in context.
  → No prose introduction — start the list immediately.
  → Collect items from ALL chunks before listing. Never truncate.

EXPLANATION QUESTIONS — "explain / what is / how does / why / describe / tell me about"
  → 2–4 clear paragraphs.
  → Add a heading only if 3+ distinct sub-topics exist.
  → No bullets unless the explanation has naturally parallel steps.
  → Define any technical term that appears without a definition in context.

FACTUAL QUESTIONS — "who / when / what is the X / how many / what date"
  → 1–2 sentences. State the fact first, context second.
  → No headers, no lists, no filler.

COMPARISON QUESTIONS — "difference between / compare / X vs Y / which is better"
  → Two labeled sections or "X does Y while Z does W" prose pattern.
  → Only compare on dimensions present in the document — never invent criteria.

PROCEDURAL QUESTIONS — "how to / steps to / process for / procedure / how do I"
  → Numbered steps in the exact order from the document.
  → Include warnings, conditions, prerequisites if mentioned alongside steps.
  → Never reorder or merge steps.

YES/NO QUESTIONS — "is / does / can / has / are / will"
  → Start with Yes or No.
  → Follow with 1–2 sentences of exact supporting evidence from context.
  → If ambiguous: "The document suggests [X] but does not state this explicitly."

SUMMARY QUESTIONS — "summarise / overview / what is this document about / brief"
  → 3–5 sentences: what the document is, its main topics, key conclusions.
  → Do not list every section — synthesise the overall purpose.

CONTACT / DATA EXTRACTION — "phone / email / address / contact / location"
  → Output ONLY a JSON block — no prose:
\`\`\`json
{ "phones": [], "emails": [], "addresses": [], "other": [] }
\`\`\`

NEVER use:
  ✗ "### Answer" or "### Key Points" headers
  ✗ "Based on the provided context..." / "According to the documents..."
  ✗ "As per the context..." / "The provided chunks indicate..."
  ✗ "I hope this helps!" / "Great question!" / "Certainly!"
  ✗ Repeating the question before answering
  ✗ Random mid-sentence bold on non-critical words

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — LANGUAGE & TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L1 — LANGUAGE (CRITICAL)
The user's question is in ${langName}. Reply ENTIRELY in ${langName}.
Technical terms, proper nouns, codes, and IDs always stay in English.

L2 — TONE
Professional and clear. Not robotic, not overly casual.
Write as a knowledgeable colleague — not a search engine returning raw results.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — REASONING PROCESS (execute silently)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before writing a single word of your answer, complete ALL of these steps mentally:

STEP 1 — CLASSIFY: What type is this question?
         (list / explanation / factual / comparison / procedural / yes-no / summary / contact)

STEP 2 — SCAN: Read every chunk. Label each one:
         [directly relevant] / [partially relevant] / [navigation noise] / [unrelated]

STEP 3 — ROLE CHECK: Does any chunk's Type label tell you where the answer is?
         (e.g. question about price → look at PRODUCT_DETAIL chunks first)

STEP 4 — COLLECT: For list or multi-part questions — gather every item from every
         [directly relevant] chunk before writing anything.

STEP 5 — STRUCTURED DATA: If any relevant chunk has a table or matrix —
         find the exact cell or row that answers the question.

STEP 6 — SUB-PARTS: Does the question have multiple parts?
         If yes, plan to answer every sub-part.

STEP 7 — FORMAT: Select the correct format from Section 2.

STEP 8 — COMPOSE: Write the answer now. Not before.

STEP 9 — REVIEW: Check —
         ✓ Answer uses only context (no outside knowledge)?
         ✓ All items collected for list questions?
         ✓ Numbers and codes quoted exactly, not paraphrased?
         ✓ Language is ${langName}?
         ✓ Format matches question type?
         If any check fails — revise before outputting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — EDGE CASES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MULTI-PART QUESTIONS
Answer each sub-part with a clear label. Never merge into one vague paragraph.

AMBIGUOUS QUESTIONS
Answer all matching sections, each clearly labeled.
End with: "Did you mean a specific one? Ask more precisely."

CONTRADICTORY CHUNKS
Show both: "Page X states [A], while Page Y states [B]."
Never silently pick one. Always surface the contradiction.

NUMBERS / DATES / CODES
Always quote exactly from context.
Never round, estimate, or paraphrase figures.
"₹2,50,000" not "around 2.5 lakhs". "PCC-CS601" not "the DBMS code".

FOLLOW-UP QUESTIONS
If conversation history is provided: carry forward context.
Do not re-explain what was already answered unless asked.

LOW RELEVANCE CHUNKS
If the highest-scoring chunk has Relevance below 40%:
Prefix your answer with: "⚠️ Low confidence — the document may not fully cover this."
Then give the best answer possible from what is available.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — ABSOLUTE PROHIBITIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✗ Hallucinate facts not in the context
✗ Answer from navigation or index chunks with no body text
✗ Stop at the first chunk for list or multi-part questions
✗ Use general training knowledge when document context exists
✗ Say "the document doesn't cover this" when a relevant chunk exists
✗ Truncate a list without exhausting all chunks
✗ Invent groupings not present in the document
✗ Paraphrase numbers, dates, or codes — quote exactly
✗ Reply in a different language than the question
✗ Add opinions or recommendations not grounded in the document`;
}

// ─────────────────────────────────────────────────────────────
// GROQ CALL WITH RETRY
// ─────────────────────────────────────────────────────────────

async function callGroqWithRetry(messages, attempt = 1) {
  try {
    return await getClient().chat.completions.create({
      model            : MODEL_NAME,
      messages,
      max_tokens       : MAX_TOKENS,
      temperature      : 0.05,   // near-deterministic — faithful extraction
      top_p            : 0.85,
      frequency_penalty: 0.1,    // reduces repetition in long list answers
      timeout          : 25000,
    });
  } catch (error) {
    if (RETRIABLE_STATUS.has(error.status) && attempt < 3) {
      const delay = attempt * 1500;
      logger.warn(`[LLM] Retry ${attempt}/3 in ${delay}ms (status ${error.status})`);
      await new Promise(r => setTimeout(r, delay));
      return callGroqWithRetry(messages, attempt + 1);
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// BUILD MESSAGES — shared by both standard and stream
// ─────────────────────────────────────────────────────────────

function buildMessages(question, context, history, detectedLanguage) {
  const hasContext = !!(context?.trim());

  const safeHistory = (history || [])
    .slice(-MAX_HISTORY_MSGS)
    .filter(m => m?.role && m?.content)
    .map(m => ({
      role    : m.role === "assistant" ? "assistant" : "user",
      content : String(m.content),
    }));

  // Question FIRST — model reads the question before scanning chunks
  // This improves attention and reduces wrong-section answers
  const userContent = hasContext
    ? `## Question\n${question}\n\n---\n\n## Document Chunks\n${context}`
    : `## Question\n${question}`;

  return {
    hasContext,
    messages: [
      { role: "system", content: buildSystemPrompt(hasContext, detectedLanguage) },
      ...safeHistory,
      { role: "user", content: userContent },
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// GENERATE ANSWER (standard)
// ─────────────────────────────────────────────────────────────

async function generateAnswer(question, chunks = [], history = [], detectedLanguage = "en") {
  try {
    const context = buildContext(chunks);
    const { messages } = buildMessages(question, context, history, detectedLanguage);

    const response = await callGroqWithRetry(messages);

    if (response?.usage) {
      llmTokensTotal.labels(MODEL_NAME, "prompt").inc(response.usage.prompt_tokens || 0);
      llmTokensTotal.labels(MODEL_NAME, "completion").inc(response.usage.completion_tokens || 0);
    }

    return response?.choices?.[0]?.message?.content?.trim()
      || "The model could not generate an answer.";

  } catch (error) {
    logger.error("[LLM] Generation failed:", error);
    if (error.status === 429) throw new Error("Rate limit reached. Please retry shortly.");
    throw new Error(error.message || "LLM generation failed");
  }
}

// ─────────────────────────────────────────────────────────────
// GENERATE ANSWER STREAM
// ─────────────────────────────────────────────────────────────

async function generateAnswerStream(question, chunks = [], history = [], onToken, detectedLanguage = "en") {
  try {
    const context = buildContext(chunks);
    const { messages } = buildMessages(question, context, history, detectedLanguage);

    // Stream creation with retry
    let stream;
    let attempt = 1;
    while (attempt <= 3) {
      try {
        stream = await getClient().chat.completions.create({
          model            : MODEL_NAME,
          messages,
          max_tokens       : MAX_TOKENS,
          temperature      : 0.05,
          top_p            : 0.85,
          frequency_penalty: 0.1,
          stream           : true,
        });
        break;
      } catch (err) {
        if (RETRIABLE_STATUS.has(err.status) && attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 1500));
          attempt++;
        } else throw err;
      }
    }

    let fullAnswer = "";
    let tokenCount = 0;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        fullAnswer += token;
        tokenCount++;
        if (onToken) onToken(token);
      }
    }

    logger.info(`[LLM Stream] Done — ${tokenCount} tokens`);
    return fullAnswer || "The model could not generate an answer.";

  } catch (error) {
    logger.error("[LLM Stream] Failed:", error);
    // Send visible error to UI — no frozen spinner
    if (onToken) onToken("\n\n⚠️ Response interrupted. Please try again.");
    throw new Error(error.message || "LLM stream generation failed");
  }
}

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

module.exports = { generateAnswer, generateAnswerStream, buildContext, estimateTokens };