const { pool }           = require("../db");
const { estimateTokens } = require("./llm.service");

// Max messages to load for context window management
const HISTORY_LIMIT = 10;

// ─────────────────────────────────────────────────────────────
// Create a new conversation
// ─────────────────────────────────────────────────────────────
async function createConversation(userId, documentId) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO conversations (user_id, document_id)
       VALUES ($1, $2)
       RETURNING id, created_at`,
      [userId, documentId]
    );
    return rows[0];
  } catch (error) {
    console.error("[ConvService] createConversation:", error.message);
    throw new Error("Failed to create conversation");
  }
}

// ─────────────────────────────────────────────────────────────
// Get conversation history (ordered oldest → newest)
// Returns array of { role, content } — ready for LLM messages[]
// ─────────────────────────────────────────────────────────────
async function getConversationHistory(conversationId, limit = HISTORY_LIMIT) {
  try {

    const { rows } = await pool.query(
      `SELECT role, content, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit]
    );

    return rows.reverse(); // keep chronological order for LLM

  } catch (error) {

    console.error("[ConvService] getConversationHistory:", error.message);

    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Save a single message to conversation history
// Includes token count estimate for future context management
// ─────────────────────────────────────────────────────────────
async function saveMessage(conversationId, role, content) {
  try {

    if (!["user", "assistant", "system"].includes(role)) {
      throw new Error("Invalid role");
    }

    const tokenCount = estimateTokens(content);

    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, token_count)
       VALUES ($1, $2, $3, $4)`,
      [conversationId, role, content, tokenCount]
    );

  } catch (error) {

    console.error("[ConvService] saveMessage:", error.message);

    throw new Error("Failed to save message");
  }
}

// ─────────────────────────────────────────────────────────────
// Get all conversations for a user
// ─────────────────────────────────────────────────────────────
async function getUserConversations(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT 
         c.id,
         c.document_id,
         c.created_at,
         d.original_name AS document_name,
         COUNT(m.id)     AS message_count
       FROM conversations c
       LEFT JOIN documents d ON d.id = c.document_id
       LEFT JOIN messages  m ON m.conversation_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id, c.document_id, c.created_at, d.original_name
       ORDER BY c.created_at DESC`,
      [userId]
    );
    return rows;
  } catch (error) {
    console.error("[ConvService] getUserConversations:", error.message);
    throw new Error("Failed to fetch conversations");
  }
}

// ─────────────────────────────────────────────────────────────
// Delete a conversation and all its messages (CASCADE handles it)
// ─────────────────────────────────────────────────────────────
async function deleteConversation(conversationId) {
  try {
    await pool.query(
      "DELETE FROM conversations WHERE id = $1",
      [conversationId]
    );
  } catch (error) {
    console.error("[ConvService] deleteConversation:", error.message);
    throw new Error("Failed to delete conversation");
  }
}

// ─────────────────────────────────────────────────────────────
// Get full conversation (messages + metadata)
// Useful for displaying full chat history in frontend
// ─────────────────────────────────────────────────────────────
async function getConversationDetail(conversationId) {
  try {
    const [convResult, messagesResult] = await Promise.all([
      pool.query(
        `SELECT c.id, c.created_at, d.original_name AS document_name
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

    return {
      ...convResult.rows[0],
      messages: messagesResult.rows
    };
  } catch (error) {
    console.error("[ConvService] getConversationDetail:", error.message);
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