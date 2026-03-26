// ============================================================
// Webhook Routes
// NexaSense AI Assistant
// Handling Razorpay notifications
// ============================================================

const express = require("express");
const router  = express.Router();
const webhookController = require("../controllers/webhook.controller");

// POST /api/payment/webhook
// This is PUBLIC (Razorpay calls it without JWT)
// Signature verification happens inside the controller
router.post("/", webhookController.handleRazorpayWebhook);

module.exports = router;
