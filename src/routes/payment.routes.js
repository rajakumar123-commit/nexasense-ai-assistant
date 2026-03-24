const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/payment.controller");
const authMiddleware = require("../middleware/auth.middleware");

// =========================
// CREATE ORDER
// =========================
router.post(
  "/create-order",
  authMiddleware,
  paymentController.createOrder
);

// =========================
// VERIFY PAYMENT
// =========================
router.post(
  "/verify",
  authMiddleware,
  paymentController.verifyPayment
);

module.exports = router;