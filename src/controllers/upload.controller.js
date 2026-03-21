// ============================================================
// Upload Controller
// NexaSense AI Assistant
// Handles POST /api/upload
// Uses BullMQ ingestion queue
// ============================================================

const fs = require("fs");
const path = require("path");

const db = require("../db");
const logger = require("../utils/logger");

const { addIngestionJob } = require("../queue/ingestion.queue");


// ------------------------------------------------------------
// Allowed file types
// ------------------------------------------------------------

const ALLOWED_TYPES = [
  "application/pdf"
];


// ============================================================
// POST /api/upload
// ============================================================

async function uploadFile(req, res) {

  const start = Date.now();

  try {

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }

    const {
      path: filePath,
      originalname,
      mimetype,
      size
    } = req.file;

    const userId = req.user?.id;

    // ---------------------------------------------------------
    // Validate file type
    // ---------------------------------------------------------

    if (!ALLOWED_TYPES.includes(mimetype)) {

      fs.unlink(filePath, () => {});

      return res.status(400).json({
        success: false,
        error: "Only PDF files are allowed"
      });

    }


    // ---------------------------------------------------------
    // Insert document metadata
    // ---------------------------------------------------------

    const { rows } = await db.query(
      `INSERT INTO documents
       (user_id, file_name, file_size, status)
       VALUES ($1,$2,$3,'uploading')
       RETURNING id`,
      [
        userId,
        originalname,
        size || 0
      ]
    );

    const documentId = rows[0].id;


    logger.info(
      `[Upload] Document created | doc:${documentId} | user:${userId}`
    );


    // ---------------------------------------------------------
    // Queue ingestion job
    // ---------------------------------------------------------

    try {

      await addIngestionJob({
        documentId,
        filePath,
        userId
      });

    }

    catch (queueError) {

      logger.error(
        `[Upload] Queue push failed | doc:${documentId} | ${queueError.message}`
      );

      await db.query(
        `UPDATE documents
         SET status='error',
             error_msg=$1
         WHERE id=$2`,
        [
          "Queue ingestion failed",
          documentId
        ]
      );

      fs.unlink(filePath, () => {});

      return res.status(500).json({
        success: false,
        error: "Failed to queue document for processing"
      });

    }


    // ---------------------------------------------------------
    // Success response
    // ---------------------------------------------------------

    return res.status(200).json({

      success: true,

      documentId,

      fileName: originalname,

      status: "processing",

      message: "Document uploaded successfully. Processing in background.",

      responseTimeMs: Date.now() - start

    });

  }

  catch (error) {

    logger.error("[Upload] Fatal:", error.message);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }

    return res.status(500).json({
      success: false,
      error: "Upload failed",
      details: error.message
    });

  }

}

module.exports = {
  uploadFile
};