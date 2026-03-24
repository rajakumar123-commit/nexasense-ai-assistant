'use strict';

const Razorpay = require("razorpay");

const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;

// ── Fail fast (same pattern as your codebase) ──
if (!RAZORPAY_KEY_ID) {
  throw new Error("[Razorpay Config] Missing RAZORPAY_KEY_ID");
}

if (!RAZORPAY_KEY_SECRET) {
  throw new Error("[Razorpay Config] Missing RAZORPAY_KEY_SECRET");
}

// ── Singleton instance ──
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

module.exports = razorpay;