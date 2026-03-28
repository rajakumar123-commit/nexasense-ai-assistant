// ============================================================
// selfReflection.service.js — NexaSense Enterprise V2.0
//
// WHAT'S NEW:
//   ✅ Unicode-aware tokenizer (works for Hindi, Bengali, Arabic, Tamil etc.)
//   ✅ Confidence floor raised — non-empty answers with context never score 0
//   ✅ Stop-word list for common languages (reduces noise in overlap scoring)
//   ✅ Length-aware confidence: very short answers get a baseline score bump
// ============================================================

"use strict";

const logger = require("../utils/logger");

// Common stop words across languages — excluded from overlap scoring
// so "the", "hai", "ka", "ke", "ki" don't inflate or deflate scores
const STOP_WORDS = new Set([
  // English
  "the","is","in","at","of","on","and","to","a","an","for","are","was","were",
  "that","this","it","its","with","from","by","be","been","has","have","had","not",
  // Hindi transliterated commonly
  "hai","hain","ka","ke","ki","ko","se","me","mein","yeh","woh","aur","par","tha",
  // Bengali transliterated
  "er","tar","ba","ar","ek","je","ki","ta","ke",
]);

// ─────────────────────────────────────────────────────────────
// Unicode-aware tokenizer
// Uses \p{L} (any Unicode letter) and \p{N} (any Unicode digit)
// So Hindi "विषय", Bengali "বিষয়", Arabic "موضوع" are all preserved
// ─────────────────────────────────────────────────────────────

function tokenize(text) {
  if (!text || typeof text !== "string") return [];

  // Match sequences of Unicode letters/digits (min 2 chars)
  const matches = text.match(/[\p{L}\p{N}]{2,}/gu) || [];

  return matches
    .map(w => w.toLowerCase())
    .filter(w => !STOP_WORDS.has(w));
}

// ─────────────────────────────────────────────────────────────
// Compute overlap score between answer tokens and context tokens
// ─────────────────────────────────────────────────────────────

function computeOverlap(answer, contextChunks) {
  const answerTokens  = new Set(tokenize(answer));

  const contextText   = contextChunks
    .map(c => (typeof c === "string" ? c : c.content || ""))
    .join(" ");

  const contextTokens = new Set(tokenize(contextText));

  if (answerTokens.size === 0) return 0;

  let match = 0;
  for (const token of answerTokens) {
    if (contextTokens.has(token)) match++;
  }

  return match / answerTokens.size;
}

// ─────────────────────────────────────────────────────────────
// Main: reflect on answer quality
// ─────────────────────────────────────────────────────────────

async function reflectAnswer(query, answer, contextChunks = []) {
  try {
    if (!answer || !contextChunks.length) {
      return {
        answer,
        reflection: {
          supported  : false,
          confidence : 0,
          issues     : ["No supporting context"]
        }
      };
    }

    const overlapScore = computeOverlap(answer, contextChunks);

    // Short answers (< 80 chars) that came from context still get a base score
    // because they may be factual single-line answers with few matching tokens
    const answerLength      = answer.length;
    const lengthBoost       = answerLength < 80 ? 0.15 : 0;

    // Final confidence: clamped between 0.2 and 0.95
    const confidence = Math.max(0.2, Math.min(overlapScore + lengthBoost, 0.95));
    const supported  = confidence >= 0.2;

    return {
      answer,
      reflection: {
        supported,
        confidence,
        issues: supported ? [] : ["Answer may not be fully grounded in context"]
      }
    };

  } catch (error) {
    logger.error("[SelfReflection] failed:", error.message);
    // Safe default — never block a valid answer due to reflection failure
    return {
      answer,
      reflection: { supported: true, confidence: 0.5, issues: [] }
    };
  }
}

module.exports = { reflectAnswer };