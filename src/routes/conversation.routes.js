const express = require("express");
const router = express.Router();

const {
  createConversation,
  getUserConversations,
  getConversationDetail,
  deleteConversation
} = require("../services/conversation.service");

// create new conversation
router.post("/conversations", async (req, res) => {

  try {

    const { userId, documentId } = req.body;

    if (!userId || !documentId) {

      return res.status(400).json({
        error: "userId and documentId are required"
      });
    }

    const conversation = await createConversation(userId, documentId);

    res.json(conversation);

  } catch (error) {

    console.error("[ConversationRoute]", error.message);

    res.status(500).json({
      error: "Failed to create conversation"
    });
  }
});

// get all conversations of a user
router.get("/conversations/:userId", async (req, res) => {

  try {

    const conversations = await getUserConversations(req.params.userId);

    res.json(conversations);

  } catch (error) {

    res.status(500).json({
      error: "Failed to fetch conversations"
    });
  }
});

// get full conversation
router.get("/conversation/:id", async (req, res) => {

  try {

    const conversation = await getConversationDetail(req.params.id);

    if (!conversation) {

      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json(conversation);

  } catch (error) {

    res.status(500).json({
      error: "Failed to fetch conversation"
    });
  }
});

// delete conversation
router.delete("/conversation/:id", async (req, res) => {

  try {

    await deleteConversation(req.params.id);

    res.json({ success: true });

  } catch (error) {

    res.status(500).json({
      error: "Failed to delete conversation"
    });
  }
});

module.exports = router;