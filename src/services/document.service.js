// ============================================================
// document.service.js — NexaSense V6.0 Multi-Modal
// Multi-format text extraction + Zero-RAM Gemini OCR
// ============================================================

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const logger = require("../utils/logger");

// ✅ Import Gemini tools
const { getModel } = require("./gemini.service");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

/**
 * Multi-format text extraction with automatic OCR fallback
 */
async function extractText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();

  // ── 1. Plain Text (.txt) ────────────────────────────────────
  if (ext === ".txt") {
    const text = await fsPromises.readFile(filePath, "utf8");
    if (!text || !text.trim()) throw new Error("The .txt file is empty.");
    return { text, pageCount: 1, info: { method: "native" } };
  }

  // ── 2. Word Document (.docx) ────────────────────────────────
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;
    if (!text || !text.trim()) throw new Error("No text found in DOCX.");
    return { text, pageCount: 1, info: { method: "native" } };
  }

  // ── 3. PDF with Gemini OCR Fallback ─────────────────────────
  const dataBuffer = await fsPromises.readFile(filePath);
  const data = await pdfParse(dataBuffer);

  // LOGIC: If text length is < 100 characters, it's almost certainly a scan or image.
  if (!data.text || data.text.trim().length < 100) {
    logger.info(`[OCR] Scanned PDF/Image detected. Invoking Gemini OCR...`);

    try {
      const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
      
      // Upload to Google (Temporary Storage)
      const uploadResult = await fileManager.uploadFile(filePath, {
        mimeType: "application/pdf",
        displayName: "Scanned_Document_Processing",
      });

      const model = getModel();
      const result = await model.generateContent([
        {
          fileData: {
            mimeType: uploadResult.file.mimeType,
            fileUri: uploadResult.file.uri,
          },
        },
        { text: "Extract all text from this document. Convert into clean Markdown. Preserve structure and tables." },
      ]);

      const ocrText = result.response.text();
      logger.info(`[OCR] Success: Extracted text from ${data.numpages} scanned pages.`);

      return {
        text: ocrText,
        pageCount: data.numpages,
        info: { ...data.info, method: "gemini-ocr" } // ✅ Tells worker OCR was used
      };
    } catch (ocrErr) {
      logger.error(`[OCR] Gemini OCR failed: ${ocrErr.message}`);
      throw new Error("Could not read scanned PDF. Please provide a document with selectable text.");
    }
  }

  // Default: Return native text
  return {
    text: data.text,
    pageCount: data.numpages,
    info: { ...data.info, method: "native" }
  };
}

module.exports = { extractText };