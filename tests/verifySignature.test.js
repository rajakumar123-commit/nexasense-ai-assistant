const verifySignature = require("../src/utils/verifySignature");
const crypto = require("crypto");

// Dummy secret (use real later)
const SECRET = "test_secret";

// Fake test → should FAIL
const invalid = verifySignature(
  {
    orderId: "order_test",
    paymentId: "pay_test",
    signature: "wrong_signature",
  },
  SECRET
);

console.log("Invalid test:", invalid);

// Valid test → should PASS
const orderId = "order_123";
const paymentId = "pay_123";

const body = `${orderId}|${paymentId}`;

const validSignature = crypto
  .createHmac("sha256", SECRET)
  .update(body)
  .digest("hex");

const valid = verifySignature(
  {
    orderId,
    paymentId,
    signature: validSignature,
  },
  SECRET
);

console.log("Valid test:", valid);