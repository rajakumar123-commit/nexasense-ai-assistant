// ============================================================
// Export Controller
// NexaSense AI Assistant
// Allows users to export their conversations
// ============================================================

const db = require('../db');
const logger = require('../utils/logger');


// ─────────────────────────────────────────
// GET /api/export/conversations/json
// Export conversations as JSON
// ─────────────────────────────────────────
async function exportConversationsJSON(req, res) {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT
        id,
        document_id,
        question,
        answer,
        sources
       FROM conversations
       WHERE user_id = $1
       ORDER BY id DESC`,
      [userId]
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=nexasense_conversations.json"
    );

    res.setHeader("Content-Type", "application/json");

    res.json({
      success: true,
      exported_at: new Date().toISOString(),
      total: result.rows.length,
      conversations: result.rows
    });

  } catch (error) {
    logger.error("[Export] JSON export error:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to export conversations"
    });
  }
}


// ─────────────────────────────────────────
// GET /api/export/conversations/csv
// Export conversations as CSV
// ─────────────────────────────────────────
async function exportConversationsCSV(req, res) {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT
        id,
        document_id,
        question,
        answer
       FROM conversations
       WHERE user_id = $1
       ORDER BY id DESC`,
      [userId]
    );

    const rows = result.rows;

    let csv = "id,document_id,question,answer\n";

    rows.forEach(row => {
      const question = (row.question || "").replace(/"/g, '""');
      const answer = (row.answer || "").replace(/"/g, '""');

      csv += `"${row.id}","${row.document_id}","${question}","${answer}"\n`;
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=nexasense_conversations.csv"
    );

    res.setHeader("Content-Type", "text/csv");

    res.send(csv);

  } catch (error) {
    logger.error("[Export] CSV export error:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to export conversations"
    });
  }
}


// ─────────────────────────────────────────

module.exports = {
  exportConversationsJSON,
  exportConversationsCSV
};