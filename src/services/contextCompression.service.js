// ============================================================
// contextCompression.service.js — NexaSense Enterprise V2.0
//
// WHAT'S NEW:
//   ✅ Table rows (lines with |) are NEVER collapsed
//   ✅ List items (-/*/•/1.) are NEVER collapsed
//   ✅ Only pure prose has whitespace normalised
//   ✅ Preserves page headers and subheadings
//   ✅ Removes truly junk lines (pure whitespace, repeated dashes)
// ============================================================

"use strict";

const logger = require("../utils/logger");

const TABLE_LINE = /\|/;
const LIST_ITEM  = /^(\s*[-*•]|\s*\d+[.)]\s)/;
const JUNK_LINE  = /^[-=_]{5,}$/;   // lines like -----, =====, _____

// ─────────────────────────────────────────────────────────────
// Compress a single chunk's content — structure-aware
// ─────────────────────────────────────────────────────────────

function compressChunkContent(text) {
  if (!text) return "";

  const lines = text.split("\n");
  const out   = [];

  for (const line of lines) {
    // Drop pure junk separator lines
    if (JUNK_LINE.test(line.trim())) continue;

    // Preserve table rows exactly as-is
    if (TABLE_LINE.test(line)) {
      out.push(line);
      continue;
    }

    // Preserve list items exactly as-is (don't collapse internal whitespace)
    if (LIST_ITEM.test(line)) {
      out.push(line.trimEnd()); // only remove trailing space
      continue;
    }

    // For prose: collapse multiple internal spaces but keep line breaks
    const trimmed = line.replace(/  +/g, " ").trim();
    if (trimmed.length > 0) {
      out.push(trimmed);
    }
  }

  // Re-join but collapse excessive consecutive blank lines to at most 1
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─────────────────────────────────────────────────────────────
// Main: compress array of chunk objects
// ─────────────────────────────────────────────────────────────

async function compressContext(query, chunks = []) {
  try {
    if (!chunks.length) return [];

    return chunks.map(chunk => ({
      ...chunk,
      content: compressChunkContent(
        typeof chunk === "string" ? chunk : (chunk.content || "")
      ),
    }));

  } catch (error) {
    logger.error("[ContextCompression] failed:", error.message);
    return chunks;
  }
}

module.exports = { compressContext };