const fs   = require("fs");
const { pool } = require("../db");
const { extractText }         = require("../services/document.service");
const recursiveChunk          = require("../utils/recursiveChunk");
const { embedAndStoreChunks } = require("../services/embedder.service");
const { addIngestionJob } = require("../queue/ingestion.queue");
async function uploadFile(req, res) {

  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const filePath     = req.file.path;
  const originalName = req.file.originalname;
  const storedName   = req.file.filename;

  // Temp userId for testing — replace with req.user.id after auth is built
  const userId = req.user?.id || "493345bd-f590-4327-8395-4b049823a702";

  const client = await pool.connect();
  let documentId;

  try {
    await client.query("BEGIN");

    // Step 1: Insert document record
    const { rows } = await client.query(
      `INSERT INTO documents (user_id, original_name, filename, status)
       VALUES ($1, $2, $3, 'processing') RETURNING id`,
      [userId, originalName, storedName]
    );
    documentId = rows[0].id;

    // CRITICAL: Commit document BEFORE inserting chunks
    // chunks table has foreign key to documents.id
    // If document is not committed, chunks insert fails with FK violation
    await client.query("COMMIT");

    // Step 2: Extract text from PDF
    const { text, pageCount } = await extractText(filePath);

    if (!text || text.trim().length === 0) {
      throw new Error("No text could be extracted from this PDF");
    }

    // Step 3: Chunk the text
    const rawChunks = recursiveChunk(text);

    if (!rawChunks.length) {
      throw new Error("Chunking produced no results");
    }

    const chunks = rawChunks.map((content, index) => ({
      content,
      pageNumber: 1,
      chunkIndex: index
    }));

    console.log(`Chunks created: ${chunks.length}`);

    // Step 4: Embed chunks + store in Chroma + PostgreSQL
    addIngestionJob({
  documentId,
  filePath
});

    // Step 5: Update page count on document
    await pool.query(
      "UPDATE documents SET page_count = $1 WHERE id = $2",
      [pageCount, documentId]
    );

    res.status(200).json({
      success:     true,
      documentId,
      filename:    originalName,
      pageCount,
      totalChunks: chunks.length,
      message:     "Document processed successfully"
    });

  } catch (error) {
    // If document was already committed, mark it as failed
    if (documentId) {
      await pool.query(
        "UPDATE documents SET status = 'failed' WHERE id = $1",
        [documentId]
      );
    } else {
      try { await client.query("ROLLBACK"); } catch (_) {}
    }

    console.error("[UploadController] Error:", error.message);
    res.status(500).json({
      success: false,
      error:   "Document processing failed",
      details: error.message
    });

  } finally {
    client.release();
    if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
  }
}

module.exports = { uploadFile };