// ============================================================
// queryRewrite.service.js — NexaSense Enterprise V7.0 God Tier
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
//   ✅ V7.0: Zero-latency semester normalization (6 → VI → 6th)
//   ✅ V7.0: Roman numeral expansion injected before LLM call
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
// SEMESTER NORMALIZER — Zero-latency, runs BEFORE any LLM call
// Converts "semester 6" → multiple format variants that cover
// both Arabic (6) and Roman (VI) numeral forms found in PDFs
// ─────────────────────────────────────────────────────────────

const ARABIC_TO_ROMAN = {
  1: "I", 2: "II", 3: "III", 4: "IV",
  5: "V", 6: "VI", 7: "VII", 8: "VIII",
};

const ORDINALS = {
  1: "first",  2: "second", 3: "third",  4: "fourth",
  5: "fifth",  6: "sixth",  7: "seventh", 8: "eighth",
};

/**
 * Detects semester references in a query and returns an array of
 * expanded variant strings that cover every format an academic PDF
 * might use. Returns [] if no semester reference found.
 *
 * Examples:
 *   "semester 6 subjects"  → ["semester VI subjects", "6th semester subjects", "sixth semester subjects", ...]
 *   "6th sem"              → ["semester 6", "semester VI", "sixth semester", ...]
 *   "sem VI"               → ["semester 6", "semester VI", "6th semester", ...]
 */
function normalizeSemesterQuery(query) {
  if (!query || typeof query !== "string") return [];

  // Match patterns like: semester 6, sem 6, 6th sem, sem VI, semester VI
  const arabicMatch = query.match(/\b(?:sem(?:ester)?\s*(\d+)|(\d+)(?:st|nd|rd|th)?\s*sem(?:ester)?)\b/i);
  const romanMatch  = query.match(/\b(?:sem(?:ester)?\s*(I{1,3}|IV|V|VI{0,3}|IX|X))\b/i);

  let semNum = null;

  if (arabicMatch) {
    semNum = parseInt(arabicMatch[1] || arabicMatch[2], 10);
  } else if (romanMatch) {
    // Convert Roman → Arabic
    const romanStr = (romanMatch[1] || "").toUpperCase();
    const rev = Object.entries(ARABIC_TO_ROMAN).find(([, v]) => v === romanStr);
    if (rev) semNum = parseInt(rev[0], 10);
  }

  if (!semNum || !ARABIC_TO_ROMAN[semNum]) return [];

  const roman   = ARABIC_TO_ROMAN[semNum];
  const ordinal = ORDINALS[semNum];

  // Capture the rest of the query (the topic part)
  const topic = query
    .replace(/\b(\d+)(st|nd|rd|th)?\s*sem(ester)?\b/gi, "")
    .replace(/\bsem(ester)?\s*(\d+|I{1,3}|IV|V|VI{0,3}|IX|X)\b/gi, "")
    .trim();

  const variants = [
    `semester ${semNum} ${topic}`.trim(),
    `semester ${roman} ${topic}`.trim(),
    `${semNum}th semester ${topic}`.trim(),
    `${ordinal} semester ${topic}`.trim(),
    `sem ${semNum} ${topic}`.trim(),
    `sem ${roman} ${topic}`.trim(),
    // Table-heading variants that appear in academic PDFs:
    `Semester ${roman}`,
    `Semester-${roman}`,
    `SEMESTER ${roman}`,
    `${semNum}th Sem`,
  ];

  // Deduplicate and clean
  return [...new Set(variants.map(v => v.replace(/\s+/g, " ").trim()).filter(v => v.length > 2))];
}

// ─────────────────────────────────────────────────────────────
// PROMPT BUILDER — handles poor queries
// ─────────────────────────────────────────────────────────────

function buildPrompt(question, context) {
  return `You are an expert multilingual search query optimizer for an enterprise RAG (document retrieval) system.
Your job: transform ANY user input — no matter how vague, short, misspelled, or poorly written — into
the best possible search queries to retrieve accurate document chunks from ANY type of document.

You must handle ALL document types:
  - Academic / Syllabus PDFs: "sem 6 sub", "6th sem", "syllabus it"
  - Technical / ML PDFs: "types of algo", "diff between SVM and KNN", "how does backprop work"
  - Textbooks: "chapter 3 summary", "explain gradient descent", "what is overfitting"
  - Legal / Policy docs: "termination clause", "privacy policy data retention"
  - Business docs: "Q3 revenue", "pricing plan", "contact sales"
  - Typos: "syllbus", "semster", "algoritm", "clasification"
  - Mixed language: "6th sem ke subjects", "ML algorithms kya hote hain"
  - Abbreviations: "sem", "algo", "ML", "NLP", "SVM", "dept", "CO", "PO"

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
Even if the query is a fragment, infer the FULL intent.

ACADEMIC examples:
  - "sem 6 sub" → "list all subjects in semester 6"
  - "6th sem" → "what is the syllabus for 6th semester"
  - "CO PO mapping" → "course outcome to program outcome mapping table"
  - "internal marks" → "internal assessment marks distribution"

TECHNICAL examples (CRITICAL — must get these right):
  - "types of algo" → "what are the different types of machine learning algorithms"
  - "diff between SVM KNN" → "what is the difference between support vector machine and k-nearest neighbors"
  - "how backprop works" → "explain the backpropagation algorithm in neural networks step by step"
  - "overfitting" → "what is overfitting in machine learning and how to prevent it"
  - "gradient descent" → "explain gradient descent algorithm with types and working"
  - "supervised algorithms" → "list all supervised learning algorithms with examples"
  - "CNN architecture" → "what is the architecture of a convolutional neural network"
  - "decision boundary" → "explain decision boundary in classification algorithms"

Produce a complete, natural, grammatically correct standalone question in the USER'S LANGUAGE
that captures the full intent. Fix all typos, expand all abbreviations, complete any fragment.

### TASK 3 - ENGLISH SEARCH QUERIES (exactly 3, diverse)
Generate exactly 3 English keyword queries. Each must target a DIFFERENT angle:
  Query 1 (Exact): Most specific exact terms — the main technical concept verbatim
  Query 2 (Broad): Synonyms, alternate phrasings, hypernyms / hyponyms of the concept
  Query 3 (Structure): Target the document structure — section heading, table header, list item

RULES for each query:
  - Max 12 words
  - For syllabus/subject queries: include "semester N subjects", "semester N course codes"
  - ⚠️ ACADEMIC ROMAN NUMERAL RULE: Any semester number MUST appear in BOTH Arabic (6) AND Roman (VI)
    Academic PDFs use Roman numerals. Missing this = certain retrieval failure.
    Example: "semester 6" → Query 1="semester 6 subjects", Query 2="semester VI subjects", Query 3="6th semester list"
  - ⚠️ TYPES-OF RULE: If query asks "types of X" or "kinds of X", you MUST enumerate the known subtypes.
    Do NOT generate generic queries. ENUMERATE what those types typically are in the doc domain.
    Example: "types of algorithms" → Query 2="supervised unsupervised reinforcement learning algorithms",
    Query 3="classification regression clustering algorithms types"
  - For technical concept queries: include the concept + definition, types, working, difference
  - For outcome queries: "course outcomes CO PO", "program outcomes matrix"
  - Never repeat the same query
  - Always in English regardless of user language

### TASK 4 - HYPOTHETICAL DOCUMENT (English, 1-2 sentences)
Describe what the IDEAL document chunk answering this query looks like. Be specific about structure.
Examples:
  - "A table listing Semester 6 IT subjects with codes: IT601 Software Engineering 4L..."
  - "Section 3.2: Types of Machine Learning: 1. Supervised Learning - algorithms that learn from labeled data..."
  - "Definition: An algorithm is a step-by-step procedure. Types: (1) Supervised (2) Unsupervised (3) Reinforcement"
  - "Contact information: Phone: +91-XXXXXXXXXX, Email: info@college.edu"

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

    // ✅ V7.0: Zero-latency semester normalization BEFORE any LLM call.
    // This generates Roman numeral variants purely via string manipulation
    // so even if Gemini/Groq fails, we still have proper query variants.
    const semesterVariants = normalizeSemesterQuery(question);
    if (semesterVariants.length > 0) {
      logger.info(`[QueryRewrite] Semester normalization: ${semesterVariants.length} variants for "${question.slice(0, 40)}"`);
    }

    const prompt = buildPrompt(question, context);

    // PRIMARY: Gemini Flash
    let raw;
    try {
      raw = await askGemini(prompt);
    } catch (geminiErr) {
      logger.warn("[QueryRewrite] Gemini failed, falling back to Groq:", geminiErr.message);
      const groqResult = await rewriteWithGroq(question, context);
      // Inject semester variants into Groq result too
      if (semesterVariants.length > 0) {
        groqResult.searchQueries = [...new Set([...groqResult.searchQueries, ...semesterVariants])].slice(0, 8);
      }
      return groqResult;
    }

    if (!raw || raw.trim().length === 0) {
      const groqResult = await rewriteWithGroq(question, context);
      if (semesterVariants.length > 0) {
        groqResult.searchQueries = [...new Set([...groqResult.searchQueries, ...semesterVariants])].slice(0, 8);
      }
      return groqResult;
    }

    const parsed = parseAndValidate(raw, question);

    // ✅ Merge LLM-generated queries with our zero-latency semester variants
    if (semesterVariants.length > 0) {
      parsed.searchQueries = [...new Set([...parsed.searchQueries, ...semesterVariants])].slice(0, 8);
      logger.debug(`[QueryRewrite] Final query set (${parsed.searchQueries.length}): ${parsed.searchQueries.slice(0,3).map(q => `"${q.slice(0,25)}"`).join(", ")} ...`);
    }

    return parsed;

  } catch (error) {
    logger.warn("[QueryRewrite] All rewriters failed:", error.message);
    const fallback = fallbackResponse(question);
    // Even in full failure, inject semester variants
    const semesterVariants = normalizeSemesterQuery(question);
    if (semesterVariants.length > 0) {
      fallback.searchQueries = semesterVariants.slice(0, 6);
    }
    return fallback;
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

module.exports = { processQueryWithGroq, normalizeSemesterQuery };