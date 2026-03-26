
const fs         = require("fs");
const fsPromises = require("fs").promises;
const path       = require("path");
const pdfParse   = require("pdf-parse");
const mammoth    = require("mammoth");

// Multi-format text extraction — routes based on file extension
async function extractText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();

  // ── Plain text ───────────────────────────────────────────────
  if (ext === ".txt") {
    const text = await fsPromises.readFile(filePath, "utf8");
    if (!text || !text.trim()) {
      throw new Error("The .txt file appears to be empty.");
    }
    return { text, pageCount: 1, info: {} };
  }

  // ── Word document ─────────────────────────────────────────────
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    const text   = result.value;
    if (!text || !text.trim()) {
      throw new Error("No text could be extracted from this DOCX file.");
    }
    return { text, pageCount: 1, info: {} };
  }

  // ── PDF (default) ─────────────────────────────────────────────
  const dataBuffer = await fsPromises.readFile(filePath);
  const data       = await pdfParse(dataBuffer);

  if (!data.text || data.text.trim().length === 0) {
    throw new Error("No text could be extracted from this PDF. It may be a scanned image.");
  }

  return {
    text:      data.text,
    pageCount: data.numpages,
    info:      data.info
  };
}

module.exports = { extractText };
