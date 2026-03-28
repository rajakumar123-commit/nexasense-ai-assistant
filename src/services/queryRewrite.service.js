// ============================================================
// queryRewrite.service.js — NexaSense Enterprise V4.0
//
// WHAT'S NEW:
//   ✅ PRIMARY: Gemini Flash (best multilingual + JSON)
//   ✅ FALLBACK: Groq llama-3.3-70b-versatile
//   ✅ Detects language + outputs detectedLanguage
//   ✅ Full INTENT INFERENCE even for vague/short/broken queries
//   ✅ Weak query detection (isWeakQuery flag)
//   ✅ 3 diverse search queries (exact / broad / structure angles)
//   ✅ Hypothetical Document (HYDE) in English
//   ✅ Handles typos, abbreviations, Hinglish, fragments
// ============================================================

"use strict";

const { askGemini } = require("./gemini.service");
const Groq          = require("groq-sdk");
const logger        = require("../utils/logger");

// Groq fallback client
let _groqClient = null;
function getGroqClient() {
  if (!_groqClient) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
    _groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groqClient;
}

// ─────────────────────────────────────────────────────────────
// PROMPT BUILDER — handles poor queries
// ─────────────────────────────────────────────────────────────

function buildPrompt(question, context) {
  return `You are an expert multilingual search query optimizer for an enterprise RAG (document retrieval) system.
Your job: transform ANY user input — no matter how vague, short, misspelled, or poorly written — into
the best possible search queries to retrieve accurate document chunks.

You must handle:
  - Short fragments: "sem 6 sub", "6th sem", "syllabus it"
  - Typos: "syllbus", "semster", "subejcts", "departemnt"
  - Mixed language: "6th sem ke subjects", "mujhe syllabus chahiye"
  - No punctuation or grammar: "what subjects semester 6 it department"
  - Vague queries: "tell me about semester", "course details", "paper"
  - Abbreviations: "sem", "dept", "sub", "mod", "chap", "CO", "PO", "PSO"

---

## INPUT

Conversation context (last 4 turns):
${context}

User question (may be poorly written):
"${question}"

---

## YOUR 5 TASKS

### TASK 1 - LANGUAGE DETECTION
Identify the language. ISO 639-1 codes: "en", "hi", "bn", "ar", "fr", "es", "ta", "te", "mr", "gu", "ur".
If mixed language (Hinglish/Benglish), use the dominant script language.

### TASK 2 - INTENT INFERENCE (MOST CRITICAL)
Even if the query is a fragment, infer the FULL intent:
  Examples:
  - "sem 6 sub" means "list all subjects in semester 6"
  - "6th sem" means "what is the syllabus for 6th semester"
  - "syllabus it" means "IT department complete syllabus"
  - "CO PO mapping" means "course outcome to program outcome mapping table"
  - "project" means "project work details or guidelines"
  - "internal marks" means "internal assessment marks distribution"
  - "5 sem subjects it" means "list all subjects in 5th semester IT department"

Produce a complete, natural, grammatically correct standalone question in the USER'S LANGUAGE
that captures the full intent. Fix all typos, expand all abbreviations, complete any fragment.

### TASK 3 - ENGLISH SEARCH QUERIES (exactly 3, diverse)
Generate exactly 3 English keyword queries. Each must target a DIFFERENT angle:
  Query 1 (Exact): Use the most specific terms — codes, names, numbers, department names
  Query 2 (Broad): Use synonyms and alternate phrasings of the core topic  
  Query 3 (Structure): Target the expected data structure — table, list, section heading

RULES for each query:
  - Max 10 words
  - Include semester number, department name, and topic if present or inferable
  - For syllabus/subject queries include: "semester N subjects", "semester N course codes"
  - For outcome queries: "course outcomes CO PO", "program outcomes matrix"
  - Never repeat the same query
  - Always in English regardless of user language

### TASK 4 - HYPOTHETICAL DOCUMENT (English, 1-2 sentences)
Describe what the IDEAL document chunk answering this query looks like. Be specific about structure.
Examples:
  - "A table listing Semester 6 IT subjects with codes: IT601 Software Engineering 4L, IT602 Computer Networks 3L..."
  - "Section 3.2 Course Outcomes (CO): CO1 - Students will be able to understand basic concepts..."
  - "Contact information: Phone: +91-XXXXXXXXXX, Email: info@college.edu, Address: 123 College Road..."

### TASK 5 - WEAK QUERY FLAG
If the original question is very short (less than 4 words) OR clearly a fragment/incomplete, set isWeakQuery to true.
Otherwise set isWeakQuery to false.

---

## OUTPUT (STRICT JSON ONLY - no markdown, no backticks, no extra text)

{"detectedLanguage":"en","standaloneQuery":"complete natural question","searchQueries":["query1","query2","query3"],"hypotheticalDocument":"ideal chunk description","isWeakQuery":false}`.trim();
}

// ─────────────────────────────────────────────────────────────
// JSON PARSER + VALIDATOR
// ─────────────────────────────────────────────────────────────

function parseAndValidate(raw, question) {
  let parsed;
  try {
    // Strip markdown fences if model wraps in ```json
    const clean = raw.replace(/```json|```/gi, "").trim();

    // Extract JSON object if there's extra text around it
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found");

    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    logger.warn("[QueryRewrite] JSON parse failed:", e.message);
    return fallbackResponse(question);
  }

  const detectedLanguage =
    typeof parsed.detectedLanguage === "string" && parsed.detectedLanguage.trim().length > 0
      ? parsed.detectedLanguage.trim().toLowerCase()
      : "en";

  const standaloneQuery =
    typeof parsed.standaloneQuery === "string" && parsed.standaloneQuery.trim().length > 0
      ? parsed.standaloneQuery.trim()
      : question;

  const searchQueries = Array.isArray(parsed.searchQueries)
    ? parsed.searchQueries
        .filter(q => typeof q === "string" && q.trim().length > 2)
        .map(q => q.trim())
        .slice(0, 3)
    : [];

  const hypotheticalDocument =
    typeof parsed.hypotheticalDocument === "string" && parsed.hypotheticalDocument.trim().length > 0
      ? parsed.hypotheticalDocument.trim()
      : standaloneQuery;

  const isWeakQuery = parsed.isWeakQuery === true;

  logger.debug(
    `[QueryRewrite] lang:${detectedLanguage} | weak:${isWeakQuery} | ` +
    `standalone:"${standaloneQuery.slice(0, 50)}" | queries:${searchQueries.length}`
  );

  return { detectedLanguage, standaloneQuery, searchQueries, hypotheticalDocument, isWeakQuery };
}

// ─────────────────────────────────────────────────────────────
// GROQ FALLBACK
// ─────────────────────────────────────────────────────────────

async function rewriteWithGroq(question, context) {
  logger.info("[QueryRewrite] Using Groq fallback");
  try {
    const response = await getGroqClient().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: buildPrompt(question, context) }],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });
    const raw = response?.choices?.[0]?.message?.content?.trim() || "";
    if (!raw) throw new Error("Empty Groq response");
    return parseAndValidate(raw, question);
  } catch (err) {
    logger.warn("[QueryRewrite] Groq fallback also failed:", err.message);
    return fallbackResponse(question);
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN FUNCTION
// ─────────────────────────────────────────────────────────────

async function processQueryWithGroq(question, history = []) {
  try {
    const context =
      history && history.length > 0
        ? history
            .slice(-4)
            .map(m => `${m.role}: ${m.content}`)
            .join("\n")
        : "None";

    const prompt = buildPrompt(question, context);

    // PRIMARY: Gemini Flash
    let raw;
    try {
      raw = await askGemini(prompt);
    } catch (geminiErr) {
      logger.warn("[QueryRewrite] Gemini failed, falling back to Groq:", geminiErr.message);
      return await rewriteWithGroq(question, context);
    }

    if (!raw || raw.trim().length === 0) {
      return await rewriteWithGroq(question, context);
    }

    return parseAndValidate(raw, question);

  } catch (error) {
    logger.warn("[QueryRewrite] All rewriters failed:", error.message);
    return fallbackResponse(question);
  }
}

// ─────────────────────────────────────────────────────────────
// SAFE FALLBACK
// ─────────────────────────────────────────────────────────────

function fallbackResponse(question) {
  return {
    detectedLanguage    : "en",
    standaloneQuery     : question,
    searchQueries       : [],
    hypotheticalDocument: question,
    isWeakQuery         : question.trim().split(/\s+/).length < 4,
  };
}

module.exports = { processQueryWithGroq };