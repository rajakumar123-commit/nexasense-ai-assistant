// ============================================================
// recursiveChunk.js
// NexaSense AI Assistant
// Production-Grade Recursive Text Chunking (Optimized)
// ============================================================

function recursiveChunk(text, chunkSize = 1200, overlap = 200) {

  // ----------------------------------------------------------
  // GUARDS
  // ----------------------------------------------------------
  if (!text || typeof text !== "string") return [];

  text = text.trim();
  if (text.length === 0) return [];

  // Prevent invalid overlap
  overlap = Math.max(0, Math.min(overlap, Math.floor(chunkSize / 2)));

  const separators = ["\n\n", "\n", ". ", " "];
  const rawChunks = [];


  // ----------------------------------------------------------
  // RECURSIVE SPLITTING (semantic-first)
  // ----------------------------------------------------------
  function splitRecursively(segment, separatorIndex = 0) {

    if (!segment || segment.trim().length === 0) return;

    // Base case
    if (segment.length <= chunkSize) {
      rawChunks.push(segment.trim());
      return;
    }

    // No separators left → hard split
    if (separatorIndex >= separators.length) {

      for (let i = 0; i < segment.length; i += (chunkSize - overlap)) {

        const piece = segment.slice(i, i + chunkSize).trim();

        if (piece.length > 0) {
          rawChunks.push(piece);
        }

      }

      return;
    }

    const separator = separators[separatorIndex];
    const parts = segment.split(separator);

    // If separator not found → go deeper
    if (parts.length === 1) {
      splitRecursively(segment, separatorIndex + 1);
      return;
    }

    let current = "";

    for (const part of parts) {

      const candidate = current
        ? current + separator + part
        : part;

      if (candidate.length > chunkSize) {

        if (current.trim().length > 0) {
          rawChunks.push(current.trim());
        }

        if (part.length > chunkSize) {
          splitRecursively(part, separatorIndex + 1);
          current = "";
        } else {
          current = part;
        }

      } else {
        current = candidate;
      }

    }

    if (current.trim().length > 0) {
      rawChunks.push(current.trim());
    }

  }

  splitRecursively(text);


  // ----------------------------------------------------------
  // APPLY OVERLAP (sliding window)
  // ----------------------------------------------------------
  if (overlap === 0 || rawChunks.length <= 1) {
    return dedupe(rawChunks);
  }

  const overlappedChunks = [rawChunks[0]];

  for (let i = 1; i < rawChunks.length; i++) {

    const prev = rawChunks[i - 1];

    const overlapText =
      prev.length > overlap
        ? prev.slice(-overlap)
        : prev;

    const merged = (overlapText + " " + rawChunks[i]).trim();

    overlappedChunks.push(merged);

  }


  // ----------------------------------------------------------
  // FINAL CLEANUP
  // ----------------------------------------------------------
  return dedupe(overlappedChunks);

}


// ----------------------------------------------------------
// DEDUPE (important for overlap)
// ----------------------------------------------------------
function dedupe(arr = []) {

  const seen = new Set();

  return arr.filter(chunk => {

    const key = chunk.slice(0, 200);

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;

  });

}


module.exports = recursiveChunk;