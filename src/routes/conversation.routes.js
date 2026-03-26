// ============================================================
// Conversation Routes
// NexaSense AI Assistant v2.0
// ============================================================

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const requirePermission = require("../middleware/permissionMiddleware");
const db = require("../db");
const logger = require("../utils/logger");

router.use(authMiddleware);


// ─────────────────────────────────────────
// Helper: UUID validation
// ─────────────────────────────────────────
function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}


// ------------------------------------------------------------
// GET /api/conversations
// ------------------------------------------------------------
router.get("/conversations", requirePermission("chat:query"), async (req, res) => {

  try {

    const userId = req.user.id;

    const { rows } = await db.query(
      `
      SELECT id, document_id, question, answer, sources, metadata, created_at
      FROM conversations
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100
      `,
      [userId]
    );

    const conversations = rows.map(r => ({
      ...r,
      sources: r.sources || [],
      metadata: r.metadata || {}
    }));

    return res.json({
      success: true,
      count: conversations.length,
      conversations
    });

  } catch (error) {

    logger.error("[Conversations] list error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch conversations"
    });

  }

});


// ------------------------------------------------------------
// GET /api/conversations/document/:documentId
// ------------------------------------------------------------
router.get("/conversations/document/:documentId", requirePermission("chat:query"), async (req, res) => {

  try {

    const userId = req.user.id;
    const { documentId } = req.params;

    const isGlobal = documentId === "all";

    if (!isGlobal && !isUUID(documentId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid document ID"
      });
    }

    const { rows } = await db.query(
      `
      SELECT c.id, 
             c.document_id, 
             c.created_at,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', m.id,
                   'role', m.role,
                   'content', m.content
                 ) ORDER BY m.created_at ASC
               ) FILTER (WHERE m.id IS NOT NULL), '[]'
             ) as messages
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = $1 AND ${isGlobal ? "c.document_id IS NULL" : "c.document_id = $2"}
      GROUP BY c.id, c.document_id, c.created_at
      ORDER BY c.created_at DESC
      LIMIT 100
      `,
      isGlobal ? [userId] : [userId, documentId]
    );

    const conversations = rows.map(r => {
      // Chat.jsx expects { id, title, messages: [] }
      // the title is derived from the first user message
      const firstUserMsg = r.messages.find(m => m.role === 'user');
      const title = firstUserMsg ? firstUserMsg.content.slice(0, 44) || "New Chat" : "New Chat";
      
      return {
        id: r.id,
        title,
        messages: r.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: [] // Sources aren't saved in messages table 
        }))
      };
    });

    return res.json({
      success: true,
      count: conversations.length,
      conversations
    });

  } catch (error) {

    logger.error("[Conversations] document list error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch conversations for document"
    });

  }

});


// ------------------------------------------------------------
// GET /api/conversations/:id
// ------------------------------------------------------------
router.get("/conversations/:id", requirePermission("chat:query"), async (req, res) => {

  try {

    const userId = req.user.id;
    const { id } = req.params;

    if (!isUUID(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid conversation ID"
      });
    }

    const { rows } = await db.query(
      `
      SELECT id, document_id, question, answer, sources, metadata, created_at
      FROM conversations
      WHERE id = $1 AND user_id = $2
      `,
      [id, userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        error: "Conversation not found"
      });
    }

    const conversation = {
      ...rows[0],
      sources: rows[0].sources || [],
      metadata: rows[0].metadata || {}
    };

    return res.json({
      success: true,
      conversation
    });

  } catch (error) {

    logger.error("[Conversations] detail error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch conversation"
    });

  }

});


// ------------------------------------------------------------
// DELETE /api/conversations/:id
// ------------------------------------------------------------
router.delete("/conversations/:id", requirePermission("chat:delete"), async (req, res) => {

  try {

    const userId = req.user.id;
    const { id } = req.params;

    if (!isUUID(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid conversation ID"
      });
    }

    const result = await db.query(
      `
      DELETE FROM conversations
      WHERE id = $1 AND user_id = $2
      `,
      [id, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        error: "Conversation not found"
      });
    }

    logger.info(`[Conversations] Deleted ${id}`);

    return res.json({
      success: true,
      message: "Conversation deleted"
    });

  } catch (error) {

    logger.error("[Conversations] delete error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to delete conversation"
    });

  }

});


module.exports = router;