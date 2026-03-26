// ============================================================
// Webhook Controller
// NexaSense AI Assistant
// Handles POST /api/payment/webhook
// Automated billing reconciliation via Razorpay events
// ============================================================

const crypto = require("crypto");
const db     = require("../db");
const logger = require("../utils/logger");

/**
 * Handle incoming Razorpay Webhooks
 */
async function handleRazorpayWebhook(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

  if (!secret) {
    logger.error("[Webhook] RAZORPAY_WEBHOOK_SECRET is not defined in .env");
    return res.status(500).json({ error: "Configuration error" });
  }

  // 1. Verify Signature
  // We use the rawBody captured in app.js for 100% accuracy
  const shasum = crypto.createHmac("sha256", secret);
  shasum.update(req.rawBody || JSON.stringify(req.body));
  const expectedSignature = shasum.digest("hex");

  if (signature !== expectedSignature) {
    logger.warn("[Webhook] Invalid signature received");
    return res.status(400).json({ error: "Invalid signature" });
  }

  const event = req.body.event;
  const payload = req.body.payload;

  logger.info(`[Webhook] Received event: ${event}`);

  // 2. Process Event
  if (event === "payment.captured" || event === "order.paid") {
    
    const payment = payload.payment?.entity || payload.order?.entity;
    const razorpayOrderId = payment.order_id;
    const paymentId = payment.id;

    if (!razorpayOrderId) {
      logger.error("[Webhook] No order_id found in payload");
      return res.status(200).send("No order_id"); // Still return 200 to Razorpay
    }

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      // A. Lock transaction record
      const txResult = await client.query(
        "SELECT * FROM transactions WHERE razorpay_order_id = $1 FOR UPDATE",
        [razorpayOrderId]
      );

      if (txResult.rows.length === 0) {
        logger.warn(`[Webhook] Transaction not found for order: ${razorpayOrderId}`);
        await client.query("ROLLBACK");
        return res.status(200).send("Order not tracked");
      }

      const tx = txResult.rows[0];

      // B. Idempotency Check
      if (tx.status === "paid") {
        logger.info(`[Webhook] Transaction ${tx.id} already marked as paid. Skipping.`);
        await client.query("ROLLBACK");
        return res.status(200).send("Already processed");
      }

      // C. Update Transaction
      await client.query(
        `UPDATE transactions 
         SET status = 'paid', 
             razorpay_payment_id = $1, 
             updated_at = NOW() 
         WHERE id = $2`,
        [paymentId, tx.id]
      );

      // D. Increment User Credits
      await client.query(
        `UPDATE users 
         SET credits = credits + $1 
         WHERE id = $2`,
        [tx.credits_bought, tx.user_id]
      );

      await client.query("COMMIT");
      logger.info(`[Webhook] Successfully reconciled payment | tx:${tx.id} | user:${tx.user_id} | credits:+${tx.credits_bought}`);

    } catch (err) {
      await client.query("ROLLBACK");
      logger.error(`[Webhook] Processing error: ${err.message}`);
      return res.status(500).json({ error: "Internal processing error" });
    } finally {
      client.release();
    }
  }

  // Always return 200 to acknowledgment the webhook
  return res.status(200).json({ status: "ok" });
}

module.exports = {
  handleRazorpayWebhook
};
