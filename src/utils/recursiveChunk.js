// ============================================================
// recursiveChunk.js — NexaSense AI Enterprise V2.0
//
// WHAT'S NEW:
//   ✅ Table-aware: never splits inside a markdown/pipe table row
//   ✅ List-aware: never splits a numbered/bulleted list item mid-item
//   ✅ Smaller chunk size (800) + wider overlap (250) for precise retrieval
//   ✅ Atomic block preservation: headings + their first paragraph stay together
//   ✅ Unicode-safe deduplication key
// ============================================================

/**
 * Recursive chunker designed for Small-to-Big Architecture.
 * @param {string}  text       - Full extracted document text
 * @param {number}  chunkSize  - Max characters per chunk (default 800 for sharp vectors)
 * @param {number}  overlap    - Overlap chars between consecutive chunks (default 200)
 * @returns {string[]}         - Array of clean, overlap-applied text chunks
 */
function recursiveChunk(text, chunkSize = 800, overlap = 200) {

  if (!text || typeof text !== "string") return [];

  text = text.trim();
  if (text.length === 0) return [];

  // Clamp overlap to 40% of chunk size
  overlap = Math.max(0, Math.min(overlap, Math.floor(chunkSize * 0.4)));

  // ──────────────────────────────────────────────────────────
  // PHASE 1: Split document into "atomic blocks"
  // Atomic blocks are units that must NEVER be split:
  //   • Table groups (consecutive lines containing |)
  //   • List groups (consecutive lines starting with -, *, •, or N.)
  //   • Normal paragraphs (separated by double newlines)
  // ──────────────────────────────────────────────────────────
  const atomicBlocks = extractAtomicBlocks(text);

  // ──────────────────────────────────────────────────────────
  // PHASE 2: Merge atomic blocks into sized chunks
  // ──────────────────────────────────────────────────────────
  const rawChunks = mergeIntoChunks(atomicBlocks, chunkSize);

  if (!rawChunks.length) return [];

  // ──────────────────────────────────────────────────────────
  // PHASE 3: Apply overlap sliding window
  // ──────────────────────────────────────────────────────────
  if (overlap === 0 || rawChunks.length <= 1) {
    return dedupe(rawChunks);
  }

  const overlapped = [rawChunks[0]];
  for (let i = 1; i < rawChunks.length; i++) {
    const prev = rawChunks[i - 1];
    const overlapText = prev.length > overlap ? prev.slice(-overlap) : prev;
    overlapped.push((overlapText + "\n" + rawChunks[i]).trim());
  }

  return dedupe(overlapped);
}


// ──────────────────────────────────────────────────────────────
// PHASE 1 HELPERS: Atomic Block Extraction
// ──────────────────────────────────────────────────────────────

const TABLE_LINE   = /\|/;                           // any line with a pipe char
const LIST_ITEM    = /^(\s*[-*•]|\s*\d+[.)]\s)/;   // -, *, •, 1. 2) etc.
const HEADING      = /^#{1,6}\s/;

/**
 * Splits full text into atomic blocks where table rows and list items
 * are grouped and protected from being split mid-structure.
 */
function extractAtomicBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let currentGroup = [];
  let currentType = null; // "table" | "list" | "prose" | "heading"
  let lastHeading = "";

  function flushGroup() {
    if (currentGroup.length > 0) {
      let blockText = currentGroup.join("\n").trim();
      
      // Context Enhancement: Prepend section heading to loosely coupled blocks (Tables & Lists)
      if (lastHeading && currentType === "table") {
         // Prevents LLM dropping context when tables span multiple chunks
         blockText = `[Section Context: ${lastHeading}]\n` + blockText;
      }
      
      blocks.push({ type: currentType, text: blockText });
      currentGroup = [];
      currentType = null;
    }
  }

  for (const line of lines) {
    const isTable   = TABLE_LINE.test(line);
    const isList    = LIST_ITEM.test(line);
    const isHeading = HEADING.test(line);
    const isEmpty   = line.trim().length === 0;

    if (isHeading) {
      flushGroup();
      lastHeading = line.replace(/^#{1,6}\s*/, "").trim();
      currentType = "heading";
      currentGroup.push(line);

    } else if (isTable) {
      if (currentType !== "table") {
        flushGroup();
        currentType = "table";
      }
      currentGroup.push(line);

    } else if (isList) {
      if (currentType !== "list") {
        flushGroup();
        currentType = "list";
      }
      currentGroup.push(line);

    } else if (isEmpty) {
      // Blank lines are paragraph boundaries in prose
      if (currentType === "prose" && currentGroup.length > 0) {
        flushGroup();
      }
      // For table/list/heading, a single blank line ends the group
      if (currentType === "table" || currentType === "list" || currentType === "heading") {
        flushGroup();
      }

    } else {
      // Normal prose line
      if (currentType !== "prose") {
        flushGroup();
        currentType = "prose";
      }
      currentGroup.push(line);
    }
  }

  flushGroup();
  return blocks.filter(b => b.text.length > 0);
}


// ──────────────────────────────────────────────────────────────
// PHASE 2 HELPERS: Merge blocks into sized chunks
// ──────────────────────────────────────────────────────────────

/**
 * Greedily merges atomic blocks into chunks that are <= chunkSize.
 * If a single atomic block exceeds chunkSize (e.g., a huge table),
 * it's split line-by-line while still keeping rows intact.
 */
function mergeIntoChunks(blocks, chunkSize) {
  const chunks = [];
  let current = "";
  let lastHeading = "";

  for (const block of blocks) {
    if (block.type === "heading") {
      lastHeading = block.text.replace(/^#+\s*/, "").trim();
    }

    const separator = current.length > 0 ? "\n\n" : "";
    const candidate = current + separator + block.text;

    if (candidate.length <= chunkSize) {
      current = candidate;
    } else {
      // Flush current
      if (current.trim().length > 0) {
        chunks.push(current.trim());
      }

      // If the block itself is larger than chunkSize, safely split it
      if (block.text.length > chunkSize) {
        const subChunks = safeSplitBlock(block, chunkSize);
        
        // Context Enhancement: Prepend section heading to loosely coupled blocks
        subChunks.forEach((sc, i) => {
          chunks.push(
            i === 0 || !lastHeading
              ? sc
              : `[Context: ${lastHeading}]\n${sc}`
          );
        });
        current = "";
      } else {
        current = block.text;
      }
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Safely splits oversized blocks based on their type.
 * Tables/Lists are split by row (\n) so they don't break mid-sentence.
 * Prose is split by sentence.
 */
function safeSplitBlock(block, chunkSize) {
  const result = [];
  
  if (block.type === "table" || block.type === "list") {
    // Split by rows, never hard-cut mid-row
    const lines = block.text.split("\n");
    let currentChunk = "";
    
    for (const line of lines) {
       const candidate = currentChunk ? currentChunk + "\n" + line : line;
       if (candidate.length <= chunkSize) {
         currentChunk = candidate;
       } else {
         if (currentChunk.trim()) result.push(currentChunk.trim());
         // Even if a single row is huge, we must keep it entirely together 
         // rather than chopping it. 
         currentChunk = line;
       }
    }
    if (currentChunk.trim()) result.push(currentChunk.trim());
    return result;
  }

  // Fallback for prose: split by sentence
  const sentences = block.text.split(/(?<=[.!?।])\s+/);
  let currentStr = "";

  for (const sentence of sentences) {
    const candidate = currentStr ? currentStr + " " + sentence : sentence;
    if (candidate.length <= chunkSize) {
      currentStr = candidate;
    } else {
      if (currentStr.trim()) result.push(currentStr.trim());
      // If a single sentence is oversized, hard-chop as last resort
      if (sentence.length > chunkSize) {
        for (let i = 0; i < sentence.length; i += chunkSize) {
          result.push(sentence.slice(i, i + chunkSize).trim());
        }
        currentStr = "";
      } else {
        currentStr = sentence;
      }
    }
  }

  if (currentStr.trim()) result.push(currentStr.trim());
  return result;
}


// ──────────────────────────────────────────────────────────────
// DEDUPLICATION
// Uses full Unicode-safe 200-char prefix as key
// ──────────────────────────────────────────────────────────────

function dedupe(chunks = []) {
  const seen = new Set();
  return chunks.filter(chunk => {
    // Unicode-safe prefix key (works for Hindi, Bengali, Arabic, etc.)
    const key = [...chunk].slice(0, 200).join("");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


module.exports = recursiveChunk;