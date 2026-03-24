const crypto = require("crypto");

/**
 * Verifies Razorpay payment signature securely
 *
 * @param {Object} params
 * @param {string} params.orderId
 * @param {string} params.paymentId
 * @param {string} params.signature
 * @param {string} secret - Razorpay key secret
 *
 * @returns {boolean}
 */
function verifySignature({ orderId, paymentId, signature }, secret) {
  try {
    // Basic validation (fail fast)
    if (!orderId || !paymentId || !signature || !secret) {
      return false;
    }

    // Create expected signature
    const body = `${orderId}|${paymentId}`;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    // Convert to buffers for secure comparison
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const receivedBuffer = Buffer.from(signature, "utf8");

    // Length mismatch → immediate fail (important)
    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    // Timing-safe comparison (prevents timing attacks)
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (error) {
    // Never throw in verification → just fail safely
    return false;
  }
}

module.exports = verifySignature;