import { Router } from "express";
import {
  initiatePayment,
  handlePaymentCallback,
  handlePaymentRedirect,
  getPaymentStatus,
  initiateProMonthlyPayment,
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
import { isPaymentTestRoutesEnabled } from "../utils/devFlags";
import { logger } from "../utils/logger";

const router = Router();

// Logging middleware for callback debugging (development only)
router.use("/easykash/callback", (req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    logger.debug("EasyKash callback received", {
      method: req.method,
      url: req.url,
      contentType: req.headers["content-type"],
    });
  }
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
  "/subscription/pro-monthly/initiate",
  requireAuth,
  validate(subscriptionProYearlySchema),
  initiateProMonthlyPayment,
);
router.post(
  "/easykash/callback",
  validate(paymentCallbackSchema),
  handlePaymentCallback,
); // EasyKash webhook (no auth - verified by HMAC)
router.get("/redirect", handlePaymentRedirect); // EasyKash redirect handler
router.get("/:order_id/status", optionalAuth, getPaymentStatus);

if (isPaymentTestRoutesEnabled()) {
  // Development-only — simulates EasyKash webhook without HMAC verification
  router.post("/easykash/callback/test", handlePaymentCallback);

  // Development-only — marks payment completed without gateway confirmation
  router.post("/test/complete/:order_id", async (req, res) => {
    try {
      const { order_id } = req.params;
      const pool = await getPool();

      await pool.request().input("orderId", sql.UniqueIdentifier, order_id)
        .query(`
        UPDATE payments 
        SET payment_status = 'completed', updated_at = GETDATE()
        WHERE order_id = @orderId
      `);

      await pool.request().input("orderId", sql.UniqueIdentifier, order_id)
        .query(`
        UPDATE [subscriptionCheckout] 
        SET status = 'confirmed', updated_at = GETDATE()
        WHERE id = @orderId
      `);

      await PaymentService.decrementStockForOrder(order_id);

      res.json({ success: true, message: "Payment marked as completed" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });
}

export default router;
