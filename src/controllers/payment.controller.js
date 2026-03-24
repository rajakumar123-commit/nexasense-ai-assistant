const razorpay = require("../config/razorpay");
const db = require("../db");
const verifySignature = require("../utils/verifySignature");

const PLAN_CONFIG = {
  credits_1000: {
    amount: 69900, // paise
    credits: 1000,
  },
};

// =========================
// CREATE ORDER
// =========================
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId } = req.body;

    // Validate input
    if (!planId) {
      return res.status(400).json({ error: "planId is required" });
    }

    const plan = PLAN_CONFIG[planId];

    if (!plan) {
      return res.status(400).json({ error: "Invalid planId" });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: plan.amount,
      currency: "INR",
      // receipt max 40 chars — use short user suffix + timestamp tail
      receipt: `rcpt_${userId.replace(/-/g, "").slice(0, 8)}_${Date.now().toString().slice(-7)}`,
    });

    // Insert transaction (pending)
    await db.query(
      `
      INSERT INTO transactions (
        id,
        user_id,
        amount,
        currency,
        credits_bought,
        status,
        razorpay_order_id,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        $1,
        $2,
        'INR',
        $3,
        'pending',
        $4,
        NOW(),
        NOW()
      )
      `,
      [
        userId,
        (plan.amount / 100).toFixed(2), // store rupees safely
        plan.credits,
        order.id,
      ]
    );

    return res.json({
      razorpayOrderId: order.id,
      amountPaise: plan.amount,
      currency: "INR",
    });
  } catch (err) {
    console.error("CreateOrder Error:", err);
    return res.status(500).json({ error: "Failed to create order" });
  }
};

// =========================
// VERIFY PAYMENT
// =========================
exports.verifyPayment = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const userId = req.user.id;

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // Validate input
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment fields" });
    }

    // Begin transaction
    await client.query("BEGIN");

    // Lock transaction row (CRITICAL)
    const txResult = await client.query(
      `
      SELECT * FROM transactions
      WHERE razorpay_order_id = $1 AND user_id = $2
      FOR UPDATE
      `,
      [razorpay_order_id, userId]
    );

    if (txResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Transaction not found" });
    }

    const tx = txResult.rows[0];

    // Idempotency check
    if (tx.status === "paid") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Already processed" });
    }

    // Verify signature AFTER lock (important)
    const isValid = verifySignature(
      {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      },
      process.env.RAZORPAY_KEY_SECRET
    );

    if (!isValid) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Update transaction
    await client.query(
      `
      UPDATE transactions
      SET
        status = 'paid',
        razorpay_payment_id = $1,
        razorpay_signature = $2,
        updated_at = NOW()
      WHERE id = $3
      `,
      [razorpay_payment_id, razorpay_signature, tx.id]
    );

    // Update user credits
    const userResult = await client.query(
      `
      UPDATE users
      SET credits = credits + $1
      WHERE id = $2
      RETURNING credits
      `,
      [tx.credits_bought, userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error("User credit update failed");
    }

    const currentCredits = userResult.rows[0].credits;

    // Commit transaction
    await client.query("COMMIT");

    return res.json({
      creditsAdded: tx.credits_bought,
      currentCredits,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("VerifyPayment Error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  } finally {
    client.release();
  }
};