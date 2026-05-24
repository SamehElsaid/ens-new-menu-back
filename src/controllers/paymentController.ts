import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/index";
import { PRO_YEARLY_CURRENCY } from "../config/proYearlyPricing";
import {
  PaymentService,
  InitiatePaymentData,
} from "../services/paymentService";
import { ApiError, asyncHandler } from "../middleware/errorHandler";

/**
 * Initiate payment with EasyKash
 */
export const initiatePayment = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { order_id, amount, name, email, mobile, currency } = req.body;

    if (!order_id || !amount || !name || !mobile) {
      throw new ApiError(400, "Missing required payment fields");
    }

    // Account owner id when JWT present (optional for guest order checkout)
    const userId =
      req.user?.userId != null ? String(req.user.userId) : undefined;

    const paymentData: InitiatePaymentData = {
      order_id,
      amount: parseFloat(amount.toString()),
      currency: currency,
      customer_name: name,
      customer_email: email,
      customer_phone: mobile,
    };

    const result = await PaymentService.initiatePayment(
      userId ?? "",
      paymentData,
    );

    res.json({
      success: true,
      data: {
        redirectUrl: result.paymentUrl,
        order_id,
        paymentId: result.paymentId,
      },
      message: "Payment initiated successfully",
    });
  },
);

/**
 * Handle EasyKash payment callback
 */
export const handlePaymentCallback = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const callbackData = req.body;

    console.log("═══════════════════════════════════════");
    console.log("📞 EasyKash Callback Received");
    console.log("═══════════════════════════════════════");
    console.log("Headers:", JSON.stringify(req.headers, null, 2));
    console.log("Body:", JSON.stringify(callbackData, null, 2));
    console.log("═══════════════════════════════════════");

    try {
      const result = await PaymentService.handleCallback(callbackData);

      console.log("✅ Callback processed successfully:", result);

      res.json({
        success: true,
        message: "Payment callback processed successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("❌ Callback processing failed:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
      });

      // Still return 200 to Easykash to prevent retries
      // Log the error for investigation
      res.status(200).json({
        success: false,
        message: error.message || "Failed to process callback",
        error: error.message,
      });
    }
  },
);

/**
 * Handle EasyKash redirect callback (when user returns from payment page)
 * Webhook should update the DB first; if it did not (firewall, HMAC, delay), we complete payment
 * when redirect says PAID and the payment row is still pending.
 */
export const handlePaymentRedirect = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { status, providerRefNum, customerReference } = req.query;

    console.log("═══════════════════════════════════════");
    console.log("🔄 EasyKash Redirect Received");
    console.log("═══════════════════════════════════════");
    console.log("Status from redirect:", status);
    console.log("ProviderRefNum:", providerRefNum);
    console.log("CustomerReference:", customerReference);
    console.log("═══════════════════════════════════════");

    if (!customerReference) {
      throw new ApiError(400, "Missing customerReference in redirect");
    }

    // Parse customerReference to get order and payment info
    let customData: any = {};
    try {
      customData = JSON.parse(customerReference as string);
      console.log("✅ Parsed customerReference:", customData);
    } catch (e) {
      console.log("⚠️ customerReference is not JSON, using as orderId");
      customData = { orderId: customerReference };
    }

    // Get payment by order ID to find payment record
    const payment = await PaymentService.getPaymentByOrderId(
      customData.orderId || customerReference,
    );

    if (!payment) {
      console.error(
        "❌ Payment not found for orderId:",
        customData.orderId || customerReference,
      );
      throw new ApiError(404, "Payment not found");
    }

    console.log("📊 Current payment status in DB:", payment.payment_status);
    console.log("📊 Redirect status:", status);

    const completedFromRedirect =
      await PaymentService.maybeCompleteEasykashFromRedirect(
        payment,
        status as string,
        (providerRefNum as string) || undefined,
      );

    let releasedFromRedirect = false;
    if (
      !completedFromRedirect &&
      PaymentService.isBrowserRedirectFailed(status as string)
    ) {
      releasedFromRedirect =
        await PaymentService.releasePendingEasykashPayment(payment);
    }

    const paymentStatusOut = completedFromRedirect
      ? "completed"
      : releasedFromRedirect
        ? "cancelled"
        : payment.payment_status;

    if (PaymentService.isBrowserRedirectPaid(status as string)) {
      try {
        await PaymentService.syncProYearlyFromPaymentId(payment.id);
      } catch (e) {
        console.error("syncProYearlyFromPaymentId (post-redirect):", e);
      }
    }

    const paymentCompleted =
      paymentStatusOut === "completed" ||
      PaymentService.isBrowserRedirectPaid(status as string);

    res.json({
      success: true,
      data: {
        order_id: payment.order_id,
        payment_status: paymentStatusOut,
        redirect_status: status,
        providerRefNum: providerRefNum || null,
        synced_from_redirect: completedFromRedirect,
        released_from_redirect: releasedFromRedirect,
        ...(paymentCompleted && {
          value: Number(payment.amount),
          currency: PRO_YEARLY_CURRENCY,
        }),
      },
      message: completedFromRedirect
        ? "Payment confirmed from return URL; order updated."
        : releasedFromRedirect
          ? "Payment cancelled; order released."
          : "Payment redirect received. Please wait for final confirmation from payment gateway.",
    });
  },
);

/**
 * Get payment status for an order
 */
export const getPaymentStatus = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { order_id } = req.params;
    const userIdStr =
      req.user?.userId != null ? String(req.user.userId) : undefined;

    const payment = await PaymentService.getPaymentByOrderId(
      order_id,
      userIdStr,
    );

    if (!payment) {
      throw new ApiError(404, "Payment not found");
    }

    res.json({
      success: true,
      data: payment,
    });
  },
);

/**
 * Start EasyKash checkout for Pro plan — yearly billing (logged-in account owner).
 */
export const initiateProYearlyPayment = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const uid = req.user?.userId;
    if (uid == null) {
      throw new ApiError(401, "Authentication required");
    }
    const { name, email, mobile, currency, redirectUrl } = req.body;
    const nameT = String(name ?? "").trim();
    const mobileT = String(mobile ?? "").trim();
    if (!nameT || !mobileT) {
      throw new ApiError(
        400,
        "name and mobile are required",
        true,
        "الاسم والهاتف مطلوبان",
      );
    }

    const result = await PaymentService.initiateProYearlySubscription(uid, {
      customer_name: nameT,
      customer_email: email ? String(email).trim() : undefined,
      customer_phone: mobileT,
      currency,
      redirectUrl: redirectUrl ? String(redirectUrl).trim() : undefined,
    });

    res.json({
      success: true,
      data: {
        redirectUrl: result.paymentUrl,
        order_id: result.orderId,
        paymentId: result.paymentId,
        amount: result.amount,
        billingCycle: "yearly",
        planName: result.planName,
      },
      message: "Pro yearly payment initiated successfully",
    });
  },
);
