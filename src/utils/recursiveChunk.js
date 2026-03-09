// FIX: overlap now actually works — each chunk shares 'overlap' chars with next chunk
function recursiveChunk(text, chunkSize = 1200, overlap = 200) {

  // Guard: return empty array for empty input
  if (!text || text.trim().length === 0) return [];

  const separators = ["\n\n", "\n", ". ", " "];
  const rawChunks = [];

  function splitRecursively(segment, separatorIndex = 0) {
    // Base case: segment fits in one chunk
    if (segment.length <= chunkSize) {
      const trimmed = segment.trim();
      if (trimmed.length > 0) rawChunks.push(trimmed);   // FIX: skip empty chunks
      return;
    }

    // Hard split fallback: no separator worked
    if (separatorIndex >= separators.length) {
      for (let i = 0; i < segment.length; i += chunkSize - overlap) {
        const piece = segment.slice(i, i + chunkSize).trim();
        if (piece.length > 0) rawChunks.push(piece);
      }
      return;
    }

    const separator = separators[separatorIndex];
    const pieces = segment.split(separator);

    // If separator not found in this segment, try next separator
    if (pieces.length === 1) {
      splitRecursively(segment, separatorIndex + 1);
      return;
    }

    let currentChunk = "";

    for (const piece of pieces) {
      const candidate = currentChunk
        ? currentChunk + separator + piece
        : piece;

      if (candidate.length > chunkSize) {
        // Save current chunk
        if (currentChunk.trim().length > 0) {
          rawChunks.push(currentChunk.trim());
        }
        // If single piece is too big, recurse with next separator
        if (piece.length > chunkSize) {
          splitRecursively(piece, separatorIndex + 1);
          currentChunk = "";
        } else {
          currentChunk = piece;
        }
      } else {
        currentChunk = candidate;
      }
    }

    if (currentChunk.trim().length > 0) {
      rawChunks.push(currentChunk.trim());
    }
  }

  splitRecursively(text);

  // FIX: Apply overlap sliding window AFTER chunking
  // Each chunk now starts 'overlap' chars before the previous chunk ended
  if (overlap === 0 || rawChunks.length <= 1) return rawChunks;

  const overlappedChunks = [rawChunks[0]];

  for (let i = 1; i < rawChunks.length; i++) {
    const prevChunk = rawChunks[i - 1];
    const overlapText = prevChunk.slice(-overlap);     // last N chars of previous chunk
    overlappedChunks.push(overlapText + " " + rawChunks[i]);
  }

  return overlappedChunks;
}

module.exports = recursiveChunk;
