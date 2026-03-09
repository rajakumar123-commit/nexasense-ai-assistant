
const fs = require("fs");
const fsPromises = require("fs").promises;
const pdfParse = require("pdf-parse");

// FIX: async readFile instead of blocking readFileSync
async function extractText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const dataBuffer = await fsPromises.readFile(filePath);    // non-blocking
  const data = await pdfParse(dataBuffer);

  if (!data.text || data.text.trim().length === 0) {
    throw new Error("No text could be extracted from this PDF. It may be a scanned image.");
  }

  return {
    text: data.text,
    pageCount: data.numpages,
    info: data.info
  };
}

module.exports = { extractText };
