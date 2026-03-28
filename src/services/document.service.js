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

  // ── 3. PDF with Native Gemini Parsing ─────────────────────────
  if (ext === ".pdf") {
    logger.info(`[Document Parsing] Invoking Gemini Native PDF Parsing for precise Markdown extraction...`);

    let pageCount = 1;
    try {
      // Quickly get page count using pdf-parse buffer
      const dataBuffer = await fsPromises.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      pageCount = data.numpages || 1;
      
      const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
      
      // Upload to Google (Temporary Storage - auto deleted by Google after 48h)
      const uploadResult = await fileManager.uploadFile(filePath, {
        mimeType: "application/pdf",
        displayName: "Document_Processing",
      });

      const model = getModel();
      const result = await model.generateContent([
        {
          fileData: {
            mimeType: uploadResult.file.mimeType,
            fileUri: uploadResult.file.uri,
          },
        },
        { text: "Extract all text from this PDF exactly as it appears. Convert tables into perfect Markdown tables (`| | |`). Convert headings into Markdown headers (`#`, `##`). Do not add any conversational filler or greetings. Just output the extracted Markdown." },
      ]);

      const markdownText = result.response.text();
      logger.info(`[Document Parsing] Success: Extracted pristine Markdown from ${pageCount} pages using Gemini.`);

      // Optional: Slight delay to prevent hitting free-tier 15 RPM limit immediately on bulk uploads
      await new Promise(r => setTimeout(r, 2000));

      return {
        text: markdownText,
        pageCount: pageCount,
        info: { method: "gemini-native-markdown" }
      };

    } catch (err) {
      logger.warn(`[Document Parsing] Gemini API failed or rate-limited (${err.message}). Falling back to native pdf-parse...`);
      
      // Fallback
      const dataBuffer = await fsPromises.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      
      if (!data.text || data.text.trim().length < 50) {
        throw new Error("PDF contains no selectable text and Gemini Vision API is currently unavailable to read it.");
      }
      
      return {
        text: data.text,
        pageCount: data.numpages,
        info: { ...data.info, method: "native-fallback" }
      };
    }
  }

  // Unsupported Extensions will be naturally caught before this or error out
  throw new Error(`Unsupported file extension: ${ext}`);
}

module.exports = { extractText };