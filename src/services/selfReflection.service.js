// ============================================================
// selfReflection.service.js
// NexaSense AI Assistant
// Lightweight answer verification
// FIX: Replaced console.error with logger
// ============================================================

const logger = require("../utils/logger");


// ------------------------------------------------------------
// Extract words from text
// ------------------------------------------------------------
function tokenize(text) {

  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2);

}


// ------------------------------------------------------------
// Compute overlap score between answer and context
// ------------------------------------------------------------
function computeOverlap(answer, contextChunks) {

  const answerWords = new Set(tokenize(answer));

  const contextText = contextChunks
    .map(c => c.content || "")
    .join(" ");

  const contextWords = new Set(tokenize(contextText));

  let match = 0;

  answerWords.forEach(word => {
    if (contextWords.has(word)) {
      match++;
    }
  });

  if (answerWords.size === 0) return 0;

  return match / answerWords.size;

}


// ------------------------------------------------------------
// Reflect answer quality
// ------------------------------------------------------------
async function reflectAnswer(query, answer, contextChunks = []) {

  try {

    if (!answer || !contextChunks.length) {

      return {
        answer,
        reflection: {
          supported: false,
          confidence: 0,
          issues: ["No supporting context"]
        }
      };

    }

    const overlapScore =
      computeOverlap(answer, contextChunks);

    const confidence =
      Math.max(0.2, Math.min(overlapScore, 0.95));

    const supported = overlapScore > 0.2;

    return {
      answer,
      reflection: {
        supported,
        confidence,
        issues: supported
          ? []
          : ["Answer may not be fully grounded in context"]
      }
    };

  } catch (error) {

    logger.error(
      "[SelfReflection] failed:",
      error.message
    );

    return {
      answer,
      reflection: {
        supported: true,
        confidence: 0.5,
        issues: []
      }
    };

  }

}


module.exports = {
  reflectAnswer
};