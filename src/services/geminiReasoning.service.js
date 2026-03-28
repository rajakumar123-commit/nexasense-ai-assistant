// ============================================================
// geminiReasoning.service.js — NexaSense Enterprise V2.0
//
// WHAT'S NEW:
//   ✅ Accepts detectedLanguage — Gemini preserves reply language
//   ✅ Forbidden format rules injected (no ### Answer, ### Key Points)
//   ✅ Skips refinement for long list answers (> 2500 chars) — avoids re-formatting
//   ✅ Skips if ragAnswer already starts with ⚠️ (fallback answers)
//   ✅ Timeout guard preserved (30s)
// ============================================================

"use strict";

const { askGemini } = require("./gemini.service");
const logger        = require("../utils/logger");

const MAX_SOURCE_PREVIEW = 150;
const MAX_REASONING_TIME = 30_000;
const SKIP_IF_LONGER_THAN = 2500; // skip refinement for very long list answers

// ─────────────────────────────────────────────────────────────
// Build evidence string from source previews
// ─────────────────────────────────────────────────────────────

function buildEvidence(sources = []) {
  if (!sources || !sources.length) return "No evidence available.";

  try {
    return sources
      .slice(0, 6)
      .map(s => {
        const page    = s.pageNumber ? `Page ${s.pageNumber}` : "Unknown page";
        const preview = (s.preview || "").replace(/\s+/g, " ").slice(0, MAX_SOURCE_PREVIEW);
        return `[${page}]: ${preview}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────
// Safe Gemini call with timeout
// ─────────────────────────────────────────────────────────────

async function callGeminiWithTimeout(prompt) {
  try {
    return await Promise.race([
      askGemini(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Gemini reasoning timeout")), MAX_REASONING_TIME)
      ),
    ]);
  } catch (error) {
    logger.warn("[GeminiReasoning] timeout/failure:", error.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Language map
// ─────────────────────────────────────────────────────────────

const LANG_MAP = {
  en: "English", hi: "Hindi", bn: "Bengali", ar: "Arabic",
  fr: "French",  es: "Spanish", de: "German", ta: "Tamil",
  te: "Telugu",  mr: "Marathi", gu: "Gujarati", pa: "Punjabi",
  ur: "Urdu",    zh: "Chinese", ja: "Japanese", ko: "Korean",
};

// ─────────────────────────────────────────────────────────────
// Main: apply reasoning refinement
// ─────────────────────────────────────────────────────────────

async function applyReasoning(question, ragAnswer, sources = [], detectedLanguage = "en") {
  try {
    // Basic validation
    if (!ragAnswer || typeof ragAnswer !== "string") return ragAnswer;

    // Skip very short answers — no need to refine
    if (ragAnswer.length < 40) return ragAnswer;

    // Skip long list answers — Gemini tends to re-format and collapse them
    if (ragAnswer.length > SKIP_IF_LONGER_THAN) {
      logger.debug("[GeminiReasoning] Skipping — answer too long (list-type), preserving as-is");
      return ragAnswer;
    }

    // Skip fallback answers that start with ⚠️
    if (ragAnswer.startsWith("⚠️") || ragAnswer.startsWith("I couldn't find")) {
      return ragAnswer;
    }

    const langName = LANG_MAP[detectedLanguage] || detectedLanguage.toUpperCase();
    const evidence = buildEvidence(sources);

    const prompt = `
You are a precision reasoning engine for an enterprise AI assistant.

Your ONLY job is to improve the clarity and structure of an existing AI answer.
You MUST NOT add any new facts, change numbers, or introduce outside knowledge.

---

User Question:
${question}

Original Answer:
${ragAnswer}

Supporting Evidence (from document):
${evidence}

---

## STRICT GROUNDING RULES
- DO NOT add any information not present in the Original Answer or Evidence.
- DO NOT change factual content, numbers, codes, or names.
- DO NOT expand beyond what was already stated.
- You are ONLY allowed to: rephrase, restructure, clarify.

## LANGUAGE RULE — CRITICAL
- Reply ENTIRELY in ${langName}.
- Keep technical terms, subject codes (e.g., IT601), and proper nouns in English.

## FORMATTING RULES
- Preserve existing lists and tables exactly — do NOT collapse or merge list items.
- If the answer is a numbered/bulleted list, keep it as a list.
- If the answer is a table, keep it as a table.
- NEVER use "### Answer" or "### Key Points" headers.
- NEVER add "Based on...", "According to...", or closing lines like "I hope this helps!".
- Preserve any ⚠️ warning at the top if present.

## OUTPUT
Return ONLY the final refined answer. No preamble, no explanation.
`.trim();

    const improved = await callGeminiWithTimeout(prompt);

    if (!improved || improved.trim().length < 10) return ragAnswer;

    return improved.trim();

  } catch (error) {
    logger.warn("[GeminiReasoning] skipped:", error.message);
    return ragAnswer;
  }
}

module.exports = { applyReasoning };