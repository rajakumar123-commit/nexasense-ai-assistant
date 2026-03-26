// ============================================================
// conversation.service.js
// NexaSense AI Assistant
// FIX: Replaced all console.error/warn with logger
// ============================================================

const { pool } = require("../db");
const logger   = require("../utils/logger");

const HISTORY_LIMIT = 10;


// -------------------------------------------------------------
// Create a new conversation session
// -------------------------------------------------------------
async function createConversation(userId, documentId) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO conversations (user_id, document_id)
       VALUES ($1,$2)
       RETURNING id, created_at`,
      [userId, documentId === "all" ? null : documentId]
    );
    return rows[0];
  } catch (error) {
    logger.error("[ConvService] createConversation:", error.message);
    throw new Error("Failed to create conversation");
  }
}


// -------------------------------------------------------------
// Get conversation history (used by RAG pipeline)
// Returns: [{ role, content }]
// -------------------------------------------------------------
async function getConversationHistory(conversationId, limit = HISTORY_LIMIT) {
  try {
    if (!conversationId) return [];
    const { rows } = await pool.query(
      `SELECT role, content
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit]
    );
    return rows.reverse();
  } catch (error) {
    logger.error("[ConvService] getConversationHistory:", error.message);
    return [];
  }
}


// -------------------------------------------------------------
// Save message into messages table
// -------------------------------------------------------------
async function saveMessage(conversationId, role, content) {
  try {
    if (!conversationId || !content) return;
    if (!["user", "assistant", "system"].includes(role)) {
      logger.warn("[ConvService] invalid role:", role);
      return;
    }
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1,$2,$3)`,
      [conversationId, role, content]
    );
  } catch (error) {
    logger.error("[ConvService] saveMessage:", error.message);
  }
}


// -------------------------------------------------------------
// Get all conversations for a user
// -------------------------------------------------------------
async function getUserConversations(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT
         c.id,
         c.document_id,
         c.created_at,
         d.file_name AS document_name,
         COUNT(m.id) AS message_count
       FROM conversations c
       LEFT JOIN documents d ON d.id = c.document_id
       LEFT JOIN messages  m ON m.conversation_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id, c.document_id, c.created_at, d.file_name
       ORDER BY c.created_at DESC`,
      [userId]
    );
    return rows;
  } catch (error) {
    logger.error("[ConvService] getUserConversations:", error.message);
    throw new Error("Failed to fetch conversations");
  }
}


// -------------------------------------------------------------
// Delete conversation
// -------------------------------------------------------------
async function deleteConversation(conversationId) {
  try {
    await pool.query(
      `DELETE FROM conversations WHERE id = $1`,
      [conversationId]
    );
  } catch (error) {
    logger.error("[ConvService] deleteConversation:", error.message);
    throw new Error("Failed to delete conversation");
  }
}


// -------------------------------------------------------------
// Get full conversation detail with messages
// -------------------------------------------------------------
async function getConversationDetail(conversationId) {
  try {
    const [convResult, messagesResult] = await Promise.all([
      pool.query(
        `SELECT c.id, c.created_at, d.file_name AS document_name
         FROM conversations c
         LEFT JOIN documents d ON d.id = c.document_id
         WHERE c.id = $1`,
        [conversationId]
      ),
      pool.query(
        `SELECT role, content, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [conversationId]
      )
    ]);

    if (!convResult.rows.length) return null;
    return { ...convResult.rows[0], messages: messagesResult.rows };

  } catch (error) {
    logger.error("[ConvService] getConversationDetail:", error.message);
    throw new Error("Failed to fetch conversation detail");
  }
}


module.exports = {
  createConversation,
  getConversationHistory,
  saveMessage,
  getUserConversations,
  deleteConversation,
  getConversationDetail
};