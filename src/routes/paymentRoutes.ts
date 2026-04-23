import { Router } from "express";
import {
  initiatePayment,
  handlePaymentCallback,
  handlePaymentRedirect,
  getPaymentStatus,
  initiateProYearlyPayment,
} from "../controllers/paymentController";

import { getPool, sql } from "../config/database";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware";
import {
  validate,
  initiatePaymentSchema,
  paymentCallbackSchema,
  subscriptionProYearlySchema,
} from "../middleware/validation";
import { PaymentService } from "../services/paymentService";

const router = Router();

// Logging middleware for callback debugging
router.use("/easykash/callback", (req, res, next) => {
  console.log("🔔 Callback endpoint hit!");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("Raw Body:", req.body);
  next();
});

// Payment routes
router.post(
  "/initiate",
  optionalAuth,
  validate(initiatePaymentSchema),
  initiatePayment,
);
router.post(
  "/subscription/pro-yearly/initiate",
  requireAuth,
  validate(subscriptionProYearlySchema),
  initiateProYearlyPayment,
);
router.post(
  "/easykash/callback",
  validate(paymentCallbackSchema),
  handlePaymentCallback,
); // EasyKash webhook (no auth - verified by HMAC)
router.get("/redirect", handlePaymentRedirect); // EasyKash redirect handler
router.get("/:order_id/status", optionalAuth, getPaymentStatus);

// Test endpoint to manually trigger callback (for development)
router.post("/easykash/callback/test", handlePaymentCallback);

// Test endpoint to manually mark payment as completed (for development)
router.post("/test/complete/:order_id", async (req, res) => {
  try {
    const { order_id } = req.params;
    const pool = await getPool();

    // Update payment status
    await pool.request().input("orderId", sql.UniqueIdentifier, order_id)
      .query(`
        UPDATE payments 
        SET payment_status = 'completed', updated_at = GETDATE()
        WHERE order_id = @orderId
      `);

    // Update order status
    await pool.request().input("orderId", sql.UniqueIdentifier, order_id)
      .query(`
        UPDATE [subscriptionCheckout] 
        SET status = 'confirmed', updated_at = GETDATE()
        WHERE id = @orderId
      `);

    await PaymentService.decrementStockForOrder(order_id);

    res.json({ success: true, message: "Payment marked as completed" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
