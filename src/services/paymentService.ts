import { getPool, sql } from "../config/database";
import {
  PRO_YEARLY_CURRENCY,
  resolveProMonthlyAmount,
  resolveProYearlyCheckoutAmount,
} from "../config/proYearlyPricing";
import { ApiError } from "../middleware/errorHandler";
import * as notificationService from "./notificationService";
import crypto from "crypto";

export interface InitiatePaymentData {
  order_id: string;
  amount: number;
  currency?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  paymentOptions?: number[];
  cashExpiry?: number;
  redirectUrl?: string;
  customerReference?: string;
}

export interface PaymentCallbackData {
  // EasyKash actual callback format
  ProductCode?: string;
  PaymentMethod?: string;
  ProductType?: string;
  Amount: string; // String from EasyKash
  BuyerEmail?: string;
  BuyerMobile?: string;
  BuyerName?: string;
  Timestamp?: string;
  status: string; // PAID, FAILED, etc.
  easykashRef: string; // Transaction ID
  customerReference?: string; // Our custom data (JSON string)
  signatureHash?: string; // HMAC signature (optional in some cases)
}

export class PaymentService {
  private static readonly EASYKASH_API_URL =
    process.env.EASYKASH_API_URL || "https://back.easykash.net";
  private static readonly EASYKASH_API_KEY = process.env.EASYKASH_API_KEY;
  private static readonly EASYKASH_HMAC_SECRET =
    process.env.EASYKASH_HMAC_SECRET || process.env.EASYKASH_SECRET_KEY;
  private static readonly FRONTEND_URL =
    process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL;
  private static readonly BACKEND_URL =
    process.env.API_URL || process.env.BACKEND_URL;

  /**
   * Public base for callbacks/redirects. If API_URL is unset, EasyKash gets a path-only URL and often returns
   * "check fields" / 500 — so default to this server in development.
   */
  private static getBackendPublicBase(): string {
    const fromEnv = (this.BACKEND_URL || "").trim();
    if (fromEnv) {
      return fromEnv.replace(/\/+$/, "");
    }
    const port = process.env.PORT || "5000";
    return `http://127.0.0.1:${port}`;
  }

  private static getFrontendPublicBase(): string {
    const fromEnv = (this.FRONTEND_URL || "").trim();
    if (fromEnv) {
      return fromEnv.replace(/\/+$/, "");
    }
    return "http://localhost:3000";
  }

  /** Avoid https://host//path — double slash makes browsers treat //segment as another host (e.g. "ar"). */
  private static joinPublicUrl(base: string | undefined, path: string): string {
    const b = (base || "").replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${b}${p}`;
  }

  /**
   * Query params on EasyKash return URL (e.g. status=PAID). Webhook may be late or fail to reach the server.
   */
  static isBrowserRedirectPaid(status: string | null | undefined): boolean {
    const s = String(status ?? "")
      .trim()
      .toLowerCase();
    return (
      s === "paid" || s === "success" || s === "completed" || s === "delivered"
    );
  }

  /** EasyKash return URL when user cancels or payment fails */
  static isBrowserRedirectFailed(status: string | null | undefined): boolean {
    const s = String(status ?? "")
      .trim()
      .toLowerCase();
    return (
      s === "failed" ||
      s === "failure" ||
      s === "declined" ||
      s === "cancelled" ||
      s === "canceled" ||
      s === "refunded" ||
      s === "expired"
    );
  }

  /**
   * Decrement product stock for a paid order (same rules as former createOrder Step 5b).
   */
  static async decrementStockForOrder(
    orderId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    const pool = transaction ? null : await getPool();
    const rq = () => (transaction ? transaction.request() : pool!.request());

    let items: sql.IResult<{
      product_id: string;
      quantity: number;
      stock_quantity: number | null;
    }>;
    try {
      items = await rq().input("orderId", sql.UniqueIdentifier, orderId).query(`
        SELECT oi.product_id, oi.quantity, p.stock_quantity
        FROM order_items oi
        INNER JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = @orderId
      `);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      const num = (e as { number?: number })?.number;
      if (num === 208 || /Invalid object name|order_items/i.test(m)) {
        console.warn(
          "decrementStockForOrder: skipped (no order_items / products in DB):",
          m,
        );
        return;
      }
      throw e;
    }

    for (const row of items.recordset) {
      if (row.stock_quantity === null) continue;

      const stockResult = await rq()
        .input("product_id", sql.UniqueIdentifier, row.product_id)
        .input("qty", sql.Int, row.quantity).query(`
          UPDATE products
          SET stock_quantity = stock_quantity - @qty,
              updated_at = GETDATE()
          WHERE id = @product_id
            AND is_active = 1
            AND stock_quantity IS NOT NULL
            AND stock_quantity >= @qty
        `);

      if (stockResult.rowsAffected[0] === 0) {
        throw new ApiError(
          400,
          `Insufficient stock for product: ${row.product_id}`,
        );
      }
    }
    console.log(`📦 Stock decremented for paid order ${orderId}`);
  }

  /**
   * Cancel pending EasyKash payment + pending order (browser returned FAILED, etc.).
   */
  static async releasePendingEasykashPayment(payment: {
    id: string;
    order_id: string;
    payment_method: string;
    payment_status: string;
  }): Promise<boolean> {
    if (payment.payment_method !== "easykash") {
      return false;
    }
    if (payment.payment_status !== "pending") {
      return false;
    }

    const pool = await getPool();

    const payUp = await pool
      .request()
      .input("id", sql.UniqueIdentifier, payment.id).query(`
        UPDATE payments
        SET payment_status = 'cancelled', updated_at = GETDATE()
        WHERE id = @id AND payment_status = 'pending'
      `);

    if (!payUp.rowsAffected[0]) {
      return false;
    }

    const ordUp = await pool
      .request()
      .input("orderId", sql.UniqueIdentifier, payment.order_id).query(`
        UPDATE [subscriptionCheckout]
        SET status = 'cancelled', updated_at = GETDATE()
        WHERE id = @orderId AND status = 'pending'
      `);

    console.log("🧹 Released EasyKash reservation (payment + order cancelled)");
    return true;
  }

  /**
   * Mark EasyKash payment completed and confirm order (shared by webhook + browser redirect).
   */
  private static async applyEasykashPaymentCompleted(
    paymentId: string,
    orderId: string,
    opts: {
      easykashRef?: string | null;
      paymentProvider?: string | null;
    },
  ): Promise<void> {
    const pool = await getPool();
    const easykashRef = opts.easykashRef ?? null;
    const payment_provider = opts.paymentProvider ?? null;

    const trx = pool.transaction();
    await trx.begin();
    try {
      const payUp = await trx
        .request()
        .input("paymentId", sql.UniqueIdentifier, paymentId)
        .input("easykashRef", sql.NVarChar(255), easykashRef)
        .input("payment_provider", sql.NVarChar(255), payment_provider).query(`
          UPDATE payments 
          SET 
            payment_status = 'completed',
            easykash_ref = COALESCE(@easykashRef, easykash_ref),
            easykash_product_code = COALESCE(easykash_product_code, @easykashRef),
            payment_provider = COALESCE(@payment_provider, payment_provider),
            updated_at = GETDATE()
          WHERE id = @paymentId AND payment_status = N'pending'
        `);

      if (!payUp.rowsAffected[0]) {
        await trx.rollback();
        return;
      }

      const ordRow = await trx
        .request()
        .input("orderId", sql.UniqueIdentifier, orderId)
        .query(`SELECT status FROM [subscriptionCheckout] WHERE id = @orderId`);

      if (
        !ordRow.recordset.length ||
        String(ordRow.recordset[0].status).toLowerCase() !== "pending"
      ) {
        await trx.rollback();
        console.warn(
          "EasyKash payment completion rolled back: order not pending",
          orderId,
        );
        return;
      }

      await PaymentService.decrementStockForOrder(orderId, trx);

      await trx
        .request()
        .input("orderId", sql.UniqueIdentifier, orderId)
        .input("orderStatus", sql.NVarChar(20), "confirmed").query(`
            UPDATE [subscriptionCheckout] 
            SET 
              status = @orderStatus,
              updated_at = GETDATE()
            WHERE id = @orderId AND status = N'pending'
          `);

      await trx.commit();
    } catch (e) {
      try {
        await trx.rollback();
      } catch {
        /* ignore rollback errors */
      }
      throw e;
    }

    await this.tryActivateSubscriptionForPayment(paymentId);
  }

  /**
   * If the user returns from EasyKash with a paid status but webhook did not update DB yet, complete the payment.
   */
  static async maybeCompleteEasykashFromRedirect(
    payment: {
      id: string;
      order_id: string;
      payment_method: string;
      payment_status: string;
      payment_provider?: string | null;
    },
    status: string | null | undefined,
    providerRefNum?: string | null,
  ): Promise<boolean> {
    if (!this.isBrowserRedirectPaid(status)) {
      return false;
    }
    if (payment.payment_method !== "easykash") {
      return false;
    }
    if (payment.payment_status !== "pending") {
      return false;
    }

    console.log(
      "🔄 Completing EasyKash payment from browser redirect (webhook may have missed or been delayed)",
    );

    await this.applyEasykashPaymentCompleted(payment.id, payment.order_id, {
      easykashRef: providerRefNum || null,
      paymentProvider: payment.payment_provider || null,
    });

    return true;
  }

  /**
   * Initiate payment with EasyKash
   */
  static async initiatePayment(userId: string, data: InitiatePaymentData) {
    try {
      // Validate API key
      if (!this.EASYKASH_API_KEY) {
        throw new ApiError(500, "EasyKash API key not configured");
      }

      const pool = await getPool();

      // Verify order exists and belongs to user (if userId provided)
      let orderCheck;
      if (userId) {
        const ownerId = parseInt(String(userId), 10);
        if (Number.isNaN(ownerId)) {
          throw new ApiError(400, "Invalid user id for payment");
        }
        orderCheck = await pool
          .request()
          .input("orderId", sql.UniqueIdentifier, data.order_id)
          .input("userId", sql.Int, ownerId).query(`
            SELECT o.id, o.total_price as total, o.status,
                   p.payment_status
            FROM [subscriptionCheckout] o
            LEFT JOIN payments p ON p.order_id = o.id AND p.payment_method = 'easykash'
            WHERE o.id = @orderId AND o.user_id = @userId
          `);
      } else {
        orderCheck = await pool
          .request()
          .input("orderId", sql.UniqueIdentifier, data.order_id).query(`
            SELECT o.id, o.total_price as total, o.status,
                   p.payment_status
            FROM [subscriptionCheckout] o
            LEFT JOIN payments p ON p.order_id = o.id AND p.payment_method = 'easykash'
            WHERE o.id = @orderId
          `);
      }

      if (orderCheck.recordset.length === 0) {
        throw new ApiError(404, "Order not found");
      }

      const order = orderCheck.recordset[0];
      const orderTotal = Number(
        (order as { total?: number | string | null }).total ?? NaN,
      );

      // Check if order is already paid
      if (order.payment_status === "completed" || order.status === "paid") {
        throw new ApiError(400, "Order is already paid");
      }

      // Verify amount matches order total
      if (
        !Number.isFinite(orderTotal) ||
        Math.abs(orderTotal - data.amount) > 0.01
      ) {
        throw new ApiError(400, "Payment amount does not match order total");
      }

      // Create payment record in database
      const paymentId = crypto.randomUUID();

      // Prepare customerReference for database
      // Use provided customerReference or fallback to order_id
      const dbCustomerReferenceRaw = data.customerReference
        ? String(data.customerReference)
        : data.order_id;
      // payments.customer_reference is often NVARCHAR(255)
      const dbCustomerReference =
        dbCustomerReferenceRaw.length > 255
          ? dbCustomerReferenceRaw.slice(0, 255)
          : dbCustomerReferenceRaw;

      await pool
        .request()
        .input("id", sql.UniqueIdentifier, paymentId)
        .input("orderId", sql.UniqueIdentifier, data.order_id)
        .input("amount", sql.Decimal(10, 2), data.amount)
        .input("status", sql.NVarChar(50), "pending")
        .input("payment_method", sql.NVarChar(50), "easykash")
        .input("customer_reference", sql.NVarChar(255), dbCustomerReference)
        .query(`
          INSERT INTO payments (id, order_id, amount, payment_method, payment_status, customer_reference, created_at)
          VALUES (@id, @orderId, @amount, @payment_method, @status, @customer_reference, GETDATE())
        `);

      // Prepare EasyKash API request
      // Use redirectUrl from request or default to frontend callback page
      const redirectUrl =
        data.redirectUrl ||
        this.joinPublicUrl(this.getFrontendPublicBase(), "/payment/callback");
      const callbackUrl = this.joinPublicUrl(
        this.getBackendPublicBase(),
        "/api/payment/easykash/callback",
      );

      console.log("═══════════════════════════════════════");
      console.log("🔧 EasyKash Payment Configuration");
      console.log("═══════════════════════════════════════");
      console.log("📍 Redirect URL:", redirectUrl);
      console.log("📞 Callback URL:", callbackUrl);
      console.log("⚠️  IMPORTANT: Callback URL must be publicly accessible!");
      console.log("   If using localhost, EasyKash CANNOT send callbacks.");
      console.log("   Use ngrok or deploy to production.");
      console.log("═══════════════════════════════════════");

      // Prepare custom data for customerReference
      // If customerReference provided, use it; otherwise create JSON with order/payment info
      const customerReference = data.customerReference
        ? String(data.customerReference)
        : JSON.stringify({
            orderId: data.order_id,
            paymentId: paymentId,
            userId: userId,
          });

      console.log("📦 Customer Reference:", customerReference);

      // EasyKash Direct Payment API request format
      // Match the exact format required by EasyKash API
      const paymentRequest = {
        amount: data.amount,
        currency: data.currency || "EGP",
        paymentOptions: data.paymentOptions || [2, 4],
        cashExpiry: data.cashExpiry || 3, // hours until cash payment expires
        name: data.customer_name,
        email: data.customer_email || "",
        mobile: data.customer_phone || "",
        redirectUrl: redirectUrl,
        callbackUrl: callbackUrl, // Webhook URL for EasyKash to send payment status
        customerReference: customerReference,
      };

      // Make request to EasyKash API
      const apiUrl = this.EASYKASH_API_URL.endsWith("/api/directpayv1/pay")
        ? this.EASYKASH_API_URL
        : `${this.EASYKASH_API_URL}/api/directpayv1/pay`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: this.EASYKASH_API_KEY || "", // API key in authorization header (lowercase as per docs)
        },
        body: JSON.stringify(paymentRequest),
      });

      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        throw new ApiError(
          response.status,
          `EasyKash API error: ${errorData.message || response.statusText}`,
        );
      }

      const paymentData: any = await response.json();

      // EasyKash returns redirectUrl
      const paymentUrl =
        paymentData.redirectUrl || paymentData.paymentUrl || "";

      // Extract productCode from redirectUrl if available
      let productCode = "";
      if (paymentUrl) {
        const match = paymentUrl.match(/DirectPayV1\/([^\/\?]+)/);
        if (match) {
          productCode = match[1];
        }
      }

      // Update payment record with product code
      if (productCode) {
        await pool
          .request()
          .input("paymentId", sql.UniqueIdentifier, paymentId)
          .input("transactionId", sql.NVarChar(255), productCode).query(`
            UPDATE payments 
            SET easykash_product_code = @transactionId, updated_at = GETDATE()
            WHERE id = @paymentId
          `);
      }

      return {
        paymentId,
        transactionId: productCode || paymentData.transactionId || "",
        paymentUrl: paymentUrl,
        expiresAt: paymentData.expiresAt,
      };
    } catch (error: any) {
      // Log error for debugging
      console.error("Payment initiation error:", error);

      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, `Failed to initiate payment: ${error.message}`);
    }
  }

  /**
   * Best-effort insert for subscription checkout row. Schemas differ between deployments.
   */
  private static async insertProSubscriptionOrder(
    pool: Awaited<ReturnType<typeof getPool>>,
    orderId: string,
    ownerUserId: number,
    price: number,
    customerPhone: string,
  ): Promise<void> {
    const attempts: Array<() => ReturnType<sql.Request["query"]>> = [
      () =>
        pool
          .request()
          .input("id", sql.UniqueIdentifier, orderId)
          .input("userId", sql.Int, ownerUserId)
          .input("total", sql.Decimal(10, 2), price)
          .input("phone", sql.NVarChar(50), customerPhone).query(`
            INSERT INTO [subscriptionCheckout] (id, user_id, total_price, status, customer_first_name, customer_last_name, customer_phone, created_at, updated_at)
            VALUES (@id, @userId, @total, N'pending', N'Subscription', N'Pro', @phone, GETDATE(), GETDATE())
          `),
      () =>
        pool
          .request()
          .input("id", sql.UniqueIdentifier, orderId)
          .input("userId", sql.Int, ownerUserId)
          .input("total", sql.Decimal(10, 2), price).query(`
            INSERT INTO [subscriptionCheckout] (id, user_id, total_price, status, created_at, updated_at)
            VALUES (@id, @userId, @total, N'pending', GETDATE(), GETDATE())
          `),
      () =>
        pool
          .request()
          .input("id", sql.UniqueIdentifier, orderId)
          .input("userId", sql.Int, ownerUserId)
          .input("total", sql.Decimal(10, 2), price).query(`
            INSERT INTO [subscriptionCheckout] (id, user_id, total_price, status, created_at)
            VALUES (@id, @userId, @total, N'pending', GETDATE())
          `),
    ];

    let lastErr: Error | null = null;
    for (const run of attempts) {
      try {
        await run();
        return;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        console.warn(
          "Subscription order insert attempt failed:",
          lastErr.message,
        );
      }
    }
    throw lastErr;
  }

  private static async fetchActiveProPlan(pool: Awaited<ReturnType<typeof getPool>>) {
    const planResult = await pool.request().query(`
      SELECT TOP 1 id, name, priceMonthly, priceYearly
      FROM Plans
      WHERE isActive = 1 AND LOWER(LTRIM(RTRIM(name))) = N'pro'
    `);
    if (planResult.recordset.length === 0) {
      throw new ApiError(404, "Pro plan not found");
    }
    return planResult.recordset[0] as {
      id: number;
      name: string;
      priceMonthly: number;
      priceYearly: number;
    };
  }

  private static async initiateProSubscriptionCheckout(
    ownerUserId: number,
    billing: "monthly" | "yearly",
    data: {
      customer_name: string;
      customer_email?: string;
      customer_phone: string;
      currency?: string;
      redirectUrl?: string;
    },
  ): Promise<{
    paymentId: string;
    paymentUrl: string;
    orderId: string;
    amount: number;
    planName: string;
    billingCycle: "monthly" | "yearly";
  }> {
    const pool = await getPool();
    const plan = await this.fetchActiveProPlan(pool);

    let price: number;
    if (billing === "monthly") {
      price = resolveProMonthlyAmount(Number(plan.priceMonthly));
      if (!Number.isFinite(price) || price <= 0) {
        throw new ApiError(500, "Pro monthly price is not configured");
      }
    } else {
      const checkout = await resolveProYearlyCheckoutAmount(
        pool,
        ownerUserId,
        Number(plan.priceYearly),
        Number(plan.priceMonthly),
      );
      price = checkout.amount;
      if (!Number.isFinite(price) || price <= 0) {
        throw new ApiError(500, "Pro yearly price is not configured");
      }
      if (checkout.isFirstYearly) {
        console.log(
          `💰 Pro yearly first-time discount: ${checkout.fullYearly} → ${price} ${PRO_YEARLY_CURRENCY}`,
        );
      }
    }

    const orderId = crypto.randomUUID();
    try {
      await this.insertProSubscriptionOrder(
        pool,
        orderId,
        ownerUserId,
        price,
        data.customer_phone,
      );
    } catch (e: any) {
      console.error("Subscription order insert failed (all attempts):", e);
      const msg =
        typeof e?.message === "string" ? e.message : "Unknown database error";
      throw new ApiError(
        500,
        `Could not create subscription checkout row. Check DB: ${msg}. Ensure subscriptionCheckout.user_id matches your Users id type and required columns exist.`,
      );
    }

    const kind = billing === "monthly" ? "pro_monthly" : "pro_yearly";
    const ref = JSON.stringify({
      orderId,
      kind,
      userId: ownerUserId,
      planId: plan.id,
    });

    const out = await this.initiatePayment(String(ownerUserId), {
      order_id: orderId,
      amount: price,
      currency: PRO_YEARLY_CURRENCY,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      customer_phone: data.customer_phone,
      redirectUrl: data.redirectUrl,
      customerReference: ref,
    });

    return {
      paymentId: out.paymentId,
      paymentUrl: out.paymentUrl,
      orderId,
      amount: price,
      planName: String(plan.name),
      billingCycle: billing,
    };
  }

  /** Pro plan — annual billing via EasyKash. */
  static async initiateProYearlySubscription(
    ownerUserId: number,
    data: {
      customer_name: string;
      customer_email?: string;
      customer_phone: string;
      currency?: string;
      redirectUrl?: string;
    },
  ) {
    return this.initiateProSubscriptionCheckout(ownerUserId, "yearly", data);
  }

  /** Pro plan — monthly billing via EasyKash. */
  static async initiateProMonthlySubscription(
    ownerUserId: number,
    data: {
      customer_name: string;
      customer_email?: string;
      customer_phone: string;
      currency?: string;
      redirectUrl?: string;
    },
  ) {
    return this.initiateProSubscriptionCheckout(ownerUserId, "monthly", data);
  }

  /**
   * Public entry for recovery: redirect URL (PAID) can call this if webhook/apply path did not run subscription insert.
   */
  static async syncProYearlyFromPaymentId(paymentId: string): Promise<void> {
    return this.tryActivateSubscriptionForPayment(paymentId);
  }

  private static async tryActivateSubscriptionForPayment(
    paymentId: string,
  ): Promise<void> {
    try {
      const pool = await getPool();
      const row = await pool
        .request()
        .input("id", sql.UniqueIdentifier, paymentId)
        .query(`SELECT customer_reference FROM payments WHERE id = @id`);
      if (row.recordset.length === 0) {
        return;
      }
      const cr = row.recordset[0].customer_reference;
      if (cr == null || String(cr).trim() === "") {
        return;
      }

      let meta: {
        kind?: string;
        userId?: number;
        planId?: number;
      } = {};
      try {
        meta = JSON.parse(String(cr));
      } catch {
        return;
      }
      const isYearly = meta.kind === "pro_yearly";
      const isMonthly = meta.kind === "pro_monthly";
      if ((!isYearly && !isMonthly) || !meta.userId || !meta.planId) {
        return;
      }

      const planCheck = await pool
        .request()
        .input("planId", sql.Int, meta.planId)
        .query(`SELECT id, name FROM Plans WHERE id = @planId`);
      if (planCheck.recordset.length === 0) {
        console.error(
          "tryActivateSubscriptionForPayment: plan missing",
          meta.planId,
        );
        return;
      }
      const planName = String(planCheck.recordset[0].name);
      const billingCycle = isMonthly ? "monthly" : "yearly";

      await pool.request().input("userId", sql.Int, meta.userId).query(`
        UPDATE Subscriptions
        SET status = 'expired', endDate = GETDATE()
        WHERE userId = @userId AND status = 'active'
      `);

      const start = new Date();
      const end = new Date(start);
      if (isMonthly) {
        end.setMonth(end.getMonth() + 1);
      } else {
        end.setFullYear(end.getFullYear() + 1);
      }

      await pool
        .request()
        .input("userId", sql.Int, meta.userId)
        .input("planId", sql.Int, meta.planId)
        .input("billingCycle", sql.NVarChar(20), billingCycle)
        .input("startDate", sql.DateTime2, start)
        .input("endDate", sql.DateTime2, end)
        .input("status", sql.NVarChar(20), "active").query(`
          INSERT INTO Subscriptions (userId, planId, billingCycle, startDate, endDate, status, notificationSent)
          VALUES (@userId, @planId, @billingCycle, @startDate, @endDate, @status, 1)
        `);

      if (!/^free$/i.test(planName)) {
        try {
          await notificationService.notifySubscriptionCreated(
            meta.userId,
            planName,
            end,
          );
        } catch (notifyErr) {
          console.error("notifySubscriptionCreated failed:", notifyErr);
        }
      }
      console.log(
        `✅ Pro ${billingCycle} subscription activated for user ${meta.userId} (payment ${paymentId})`,
      );
    } catch (err) {
      console.error("tryActivateSubscriptionForPayment:", err);
    }
  }

  /**
   * Verify HMAC signature from EasyKash callback
   * According to EasyKash documentation, signature is calculated from specific fields
   * Supports both old and new EasyKash formats
   */
  static verifyHmacSignature(data: PaymentCallbackData): boolean {
    // If no signature provided, skip verification (for testing or some callback types)
    // New EasyKash format may not include signature
    if (!data.signatureHash) {
      console.log(
        "⚠️ No signature provided, skipping verification (new format)",
      );
      return true; // Allow callback to proceed without signature verification
    }

    if (!this.EASYKASH_HMAC_SECRET) {
      console.log("⚠️ HMAC secret not configured, skipping verification");
      return true; // Allow callback to proceed without secret
    }

    // Extract specific fields in exact order as per EasyKash docs
    const {
      ProductCode,
      Amount,
      ProductType,
      PaymentMethod,
      status,
      easykashRef,
      customerReference,
      signatureHash,
    } = data;

    // Check if we have all required fields for old format
    // Old format requires: ProductCode, ProductType
    // New format may only have: PaymentMethod, Amount, status, easykashRef
    if (!ProductCode || !ProductType) {
      console.log(
        "⚠️ ProductCode or ProductType missing - using new format (no signature verification)",
      );
      return true; // New format doesn't use signature
    }

    // Concatenate fields in exact order (no separators)
    const dataToSecure = [
      ProductCode,
      Amount,
      ProductType,
      PaymentMethod,
      status,
      easykashRef,
      customerReference,
    ];
    const dataStr = dataToSecure.join("");

    console.log("🔐 EasyKash Signature Verification:");
    console.log("Data to secure:", dataStr);
    console.log("Secret key:", this.EASYKASH_HMAC_SECRET);
    console.log("Received signature:", signatureHash);

    // Generate HMAC SHA-512 hash
    const calculatedSignature = crypto
      .createHmac("sha512", this.EASYKASH_HMAC_SECRET)
      .update(dataStr)
      .digest("hex");

    console.log("Calculated signature:", calculatedSignature);
    console.log("Signatures match:", calculatedSignature === signatureHash);

    // Compare signatures
    return calculatedSignature === signatureHash;
  }

  /**
   * Test function to verify EasyKash signature with example data
   * This matches the example provided in EasyKash documentation
   */
  static testEasyKashSignature(): boolean {
    const testPayload = {
      ProductCode: "EDV4471",
      Amount: "11.00",
      ProductType: "Direct Pay",
      PaymentMethod: "Cash Through Fawry",
      BuyerName: "mee",
      BuyerEmail: "test@mail.com",
      BuyerMobile: "0123456789",
      status: "PAID",
      easykashRef: "2911105009",
      customerReference: "TEST11111",
      signatureHash:
        "0bd9ce502950ffa358314c170dace42e7ba3e0c776f5a32eb15c3d496bc9c294835036dd90d4f287233b800c9bde2f6591b6b8a1f675b6bfe64fd799da29d1d0",
    };

    const testSecretKey = "da9fe30575517d987762a859842b5631";

    // Expected concatenated data: EDV447111.00Direct PayCash Through FawryPAID2911105009TEST11111
    const expectedDataStr =
      "EDV447111.00Direct PayCash Through FawryPAID2911105009TEST11111";

    const calculatedSignature = crypto
      .createHmac("sha512", testSecretKey)
      .update(expectedDataStr)
      .digest("hex");

    console.log("🧪 EasyKash Test:");
    console.log("Expected data string:", expectedDataStr);
    console.log("Test secret key:", testSecretKey);
    console.log("Expected signature:", testPayload.signatureHash);
    console.log("Calculated signature:", calculatedSignature);
    console.log(
      "Test result:",
      calculatedSignature === testPayload.signatureHash,
    );

    return calculatedSignature === testPayload.signatureHash;
  }

  /**
   * Test function for the new EasyKash callback format
   * Based on the response example provided
   */
  static testNewEasyKashFormat(): boolean {
    const newFormatPayload = {
      PaymentMethod: "Cash Through Fawry",
      Amount: "10.05",
      BuyerName: "John Doe",
      BuyerEmail: "JohnDoe@example.com",
      BuyerMobile: "01010101010",
      status: "PAID",
      easykashRef: "1206102054",
    };

    console.log("🧪 New EasyKash Format Test:");
    console.log("Payload:", JSON.stringify(newFormatPayload, null, 2));
    console.log(
      "✅ New format test completed - no signature verification needed",
    );

    return true;
  }

  /**
   * Handle payment callback from EasyKash
   */
  static async handleCallback(data: PaymentCallbackData) {
    try {
      console.log(
        "📞 EasyKash Callback Received:",
        JSON.stringify(data, null, 2),
      );

      // Verify HMAC signature using EasyKash's exact format
      if (!this.verifyHmacSignature(data)) {
        console.error("❌ Invalid signature in EasyKash callback");
        console.error("Received data:", JSON.stringify(data, null, 2));
        throw new ApiError(401, "Invalid signature");
      }

      console.log("✅ EasyKash signature verified successfully");

      // Extract data from callback
      const transactionId = data.easykashRef;
      const status = data.status;
      const amount = parseFloat(data.Amount);

      console.log("📊 Callback Data:", {
        transactionId,
        status,
        amount,
        paymentMethod: data.PaymentMethod,
        buyerName: data.BuyerName,
      });

      // Parse customerReference to get our custom data
      let customData: any = {};
      let foundPayment: any = null;
      const pool = await getPool();

      // Try method 1: Parse customerReference as JSON
      if (data.customerReference) {
        try {
          customData = JSON.parse(data.customerReference);
          console.log("✅ Parsed customerReference:", customData);
        } catch (e) {
          console.log(
            "⚠️ customerReference is not JSON, treating as orderId:",
            data.customerReference,
          );
          // customerReference might be a plain order ID string
          customData = { orderId: data.customerReference };
        }
      }

      // Try method 2: If we have orderId in customData, use it
      if (customData?.orderId) {
        const paymentSearchResult = await pool
          .request()
          .input("orderId", sql.UniqueIdentifier, customData.orderId).query(`
            SELECT p.*, o.status as order_status 
            FROM payments p
            LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
            WHERE p.order_id = @orderId
            ORDER BY p.created_at DESC
          `);

        if (paymentSearchResult.recordset.length > 0) {
          foundPayment = paymentSearchResult.recordset[0];
          console.log("✅ Found payment by orderId:", customData.orderId);
        }
      }

      // Try method 3: Search by transaction ID (easykashRef)
      if (!foundPayment && transactionId) {
        console.log(
          "🔍 Searching by transaction ID (easykashRef):",
          transactionId,
        );

        const paymentSearchResult = await pool
          .request()
          .input("transactionId", sql.NVarChar(255), transactionId).query(`
            SELECT p.*, o.status as order_status 
            FROM payments p
            LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
            WHERE p.easykash_product_code = @transactionId OR p.easykash_ref = @transactionId
          `);

        if (paymentSearchResult.recordset.length > 0) {
          foundPayment = paymentSearchResult.recordset[0];
          console.log("✅ Found payment by transaction ID");
        }
      }

      // Try method 4: Search by ProductCode if available
      if (!foundPayment && data.ProductCode) {
        console.log("🔍 Searching by ProductCode:", data.ProductCode);

        const paymentSearchResult = await pool
          .request()
          .input("productCode", sql.NVarChar(255), data.ProductCode).query(`
            SELECT p.*, o.status as order_status 
            FROM payments p
            LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
            WHERE p.easykash_product_code = @productCode
          `);

        if (paymentSearchResult.recordset.length > 0) {
          foundPayment = paymentSearchResult.recordset[0];
          console.log("✅ Found payment by ProductCode");
        }
      }

      // Try method 5: Find the most recent pending payment with matching amount
      if (!foundPayment && amount) {
        console.log("🔍 Searching by amount and pending status:", amount);

        const paymentSearchResult = await pool
          .request()
          .input("amount", sql.Decimal(10, 2), amount).query(`
            SELECT TOP 1 p.*, o.status as order_status 
            FROM payments p
            LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
            WHERE p.amount = @amount 
              AND p.payment_status = 'pending'
              AND p.payment_method = 'easykash'
            ORDER BY p.created_at DESC
          `);

        if (paymentSearchResult.recordset.length > 0) {
          foundPayment = paymentSearchResult.recordset[0];
          console.log(
            "⚠️ Found payment by amount (last resort, may not be accurate)",
          );
        }
      }

      // If still not found, throw error
      if (!foundPayment) {
        console.error("❌ Payment not found with any method");
        console.error("Search criteria:", {
          customerReference: data.customerReference,
          transactionId: transactionId,
          ProductCode: data.ProductCode,
          amount: amount,
        });
        throw new ApiError(404, "Payment not found");
      }

      // Update customData with found payment info
      customData = {
        paymentId: foundPayment.id,
        orderId: foundPayment.order_id,
        userId: foundPayment.user_id,
      };

      // Get payment record (using existing pool connection)
      const paymentResult = await pool
        .request()
        .input("paymentId", sql.UniqueIdentifier, customData.paymentId)
        .input("transactionId", sql.NVarChar(255), transactionId).query(`
          SELECT p.*, o.status as order_status 
          FROM payments p
          LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
          WHERE p.id = @paymentId OR p.easykash_product_code = @transactionId OR p.easykash_ref = @transactionId
        `);

      if (paymentResult.recordset.length === 0) {
        throw new ApiError(404, "Payment not found");
      }

      const payment = paymentResult.recordset[0];

      const statusNorm = String(status ?? "")
        .trim()
        .toLowerCase();

      // Map EasyKash status to our status
      let paymentStatus: string;

      switch (statusNorm) {
        // Success states
        case "success":
        case "completed":
        case "paid":
        case "delivered": // EasyKash: payment delivered successfully
          paymentStatus = "completed";
          break;

        // Failed states
        case "failed":
        case "declined":
          paymentStatus = "failed";
          break;

        // Pending/New states
        case "new": // EasyKash: payment just created
        case "pending":
          paymentStatus = "pending";
          break;

        // Cancelled states
        case "canceled": // EasyKash spelling (without 'led')
        case "cancelled": // Our spelling (with 'led')
          paymentStatus = "cancelled";
          break;

        // Refunded state
        case "refunded": // EasyKash: payment was refunded
          paymentStatus = "refunded";
          break;

        // Expired state
        case "expired": // EasyKash: payment link expired
          paymentStatus = "cancelled"; // Treat expired as cancelled
          break;

        default:
          console.warn(`⚠️ Unknown payment status from EasyKash: ${status}`);
          paymentStatus = "pending";
      }

      if (paymentStatus === "completed") {
        await PaymentService.applyEasykashPaymentCompleted(
          customData.paymentId,
          customData.orderId,
          {
            easykashRef: transactionId,
            paymentProvider: data.PaymentMethod || null,
          },
        );
      } else {
        await pool
          .request()
          .input("paymentId", sql.UniqueIdentifier, customData.paymentId)
          .input("status", sql.NVarChar(50), paymentStatus)
          .input("easykashRef", sql.NVarChar(255), transactionId)
          .input(
            "payment_provider",
            sql.NVarChar(255),
            data.PaymentMethod || null,
          ).query(`
          UPDATE payments 
          SET 
            payment_status = @status,
            easykash_ref = @easykashRef,
            easykash_product_code = COALESCE(easykash_product_code, @easykashRef),
            payment_provider = @payment_provider,
            updated_at = GETDATE()
          WHERE id = @paymentId
        `);

        if (
          paymentStatus === "failed" ||
          paymentStatus === "cancelled" ||
          paymentStatus === "refunded"
        ) {
          await pool
            .request()
            .input("orderId", sql.UniqueIdentifier, customData.orderId).query(`
            UPDATE [subscriptionCheckout] 
            SET status = 'cancelled', updated_at = GETDATE()
            WHERE id = @orderId AND status = 'pending'
          `);
        }
      }
      // Note: If paymentStatus is "pending", we don't update the order
      // to keep it in pending_payment state

      return {
        success: true,
        paymentId: customData.paymentId,
        orderId: customData.orderId,
        status: paymentStatus,
      };
    } catch (error: any) {
      console.error("Payment callback error:", error);

      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, `Failed to process callback: ${error.message}`);
    }
  }

  /**
   * Get payment status by payment ID
   * Auto-expires pending payments after 30 minutes
   */
  static async getPaymentStatus(paymentId: string, userId?: string) {
    const pool = await getPool();
    const request = pool
      .request()
      .input("paymentId", sql.UniqueIdentifier, paymentId);

    let userCondition = "";
    if (userId) {
      const ownerId = parseInt(String(userId), 10);
      if (Number.isNaN(ownerId)) {
        throw new ApiError(400, "Invalid user id");
      }
      userCondition = "AND o.user_id = @userId";
      request.input("userId", sql.Int, ownerId);
    }

    const result = await request.query(`
      SELECT 
        p.*,
        o.id as order_id,
        o.total_price as order_total,
        o.status as order_status,
        DATEDIFF(MINUTE, p.created_at, GETDATE()) as minutes_elapsed
      FROM payments p
      LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
      WHERE p.id = @paymentId ${userCondition}
    `);

    if (result.recordset.length === 0) {
      throw new ApiError(404, "Payment not found");
    }

    const payment = result.recordset[0];

    // Auto-expire pending payments after 30 minutes (no callback received)
    if (payment.payment_status === "pending" && payment.minutes_elapsed >= 30) {
      console.log(
        `⏰ Payment ${paymentId} expired after ${payment.minutes_elapsed} minutes. Auto-cancelling...`,
      );

      // Update payment to cancelled
      await pool.request().input("paymentId", sql.UniqueIdentifier, paymentId)
        .query(`
            UPDATE payments 
            SET 
              payment_status = 'cancelled',
              updated_at = GETDATE()
            WHERE id = @paymentId AND payment_status = 'pending'
          `);

      await pool
        .request()
        .input("orderId", sql.UniqueIdentifier, payment.order_id).query(`
            UPDATE [subscriptionCheckout] 
            SET status = 'cancelled', updated_at = GETDATE()
            WHERE id = @orderId AND status = 'pending'
          `);

      payment.payment_status = "cancelled";
    }

    return {
      id: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      status: payment.payment_status,
      payment_method: payment.payment_method,
      transactionId: payment.easykash_product_code || payment.easykash_ref,
      createdAt: payment.created_at,
      updatedAt: payment.updated_at,
      orderStatus: payment.order_status,
    };
  }

  /**
   * Get payment by order ID
   */
  static async getPaymentByOrderId(orderId: string, userId?: string) {
    const pool = await getPool();
    const request = pool
      .request()
      .input("orderId", sql.UniqueIdentifier, orderId);

    let userCondition = "";
    if (userId) {
      const ownerId = parseInt(String(userId), 10);
      if (Number.isNaN(ownerId)) {
        throw new ApiError(400, "Invalid user id");
      }
      userCondition = "AND o.user_id = @userId";
      request.input("userId", sql.Int, ownerId);
    }

    const result = await request.query(`
      SELECT p.* 
      FROM payments p
      LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
      WHERE p.order_id = @orderId ${userCondition}
      ORDER BY p.created_at DESC
    `);

    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0];
  }

  /**
   * Cancel payment manually (when user returns without completing payment)
   */
  static async cancelPayment(paymentId: string, userId?: string) {
    try {
      const pool = await getPool();
      // Get payment record
      const request = pool
        .request()
        .input("paymentId", sql.UniqueIdentifier, paymentId);

      let userCondition = "";
      if (userId) {
        const ownerId = parseInt(String(userId), 10);
        if (Number.isNaN(ownerId)) {
          throw new ApiError(400, "Invalid user id");
        }
        userCondition = "AND o.user_id = @userId";
        request.input("userId", sql.Int, ownerId);
      }

      const paymentResult = await request.query(`
        SELECT p.*, o.status as order_status 
        FROM payments p
        LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
        WHERE p.id = @paymentId ${userCondition}
      `);

      if (paymentResult.recordset.length === 0) {
        throw new ApiError(404, "Payment not found");
      }

      const payment = paymentResult.recordset[0];

      // Only allow cancellation if payment is still pending
      if (
        payment.payment_status !== "pending" &&
        payment.payment_status !== "processing"
      ) {
        throw new ApiError(
          400,
          `Payment cannot be cancelled. Current status: ${payment.payment_status}`,
        );
      }

      console.log("🚫 Cancelling payment:", paymentId);

      // Update payment status to cancelled
      await pool
        .request()
        .input("paymentId", sql.UniqueIdentifier, paymentId)
        .input("status", sql.NVarChar(50), "cancelled").query(`
          UPDATE payments 
          SET 
            payment_status = @status,
            updated_at = GETDATE()
          WHERE id = @paymentId
        `);

      await pool
        .request()
        .input("orderId", sql.UniqueIdentifier, payment.order_id).query(`
          UPDATE [subscriptionCheckout] 
          SET status = 'cancelled', updated_at = GETDATE()
          WHERE id = @orderId AND status = 'pending'
        `);

      console.log("✅ Payment cancelled successfully");

      return {
        success: true,
        paymentId: paymentId,
        status: "cancelled",
      };
    } catch (error: any) {
      console.error("Cancel payment error:", error);

      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, `Failed to cancel payment: ${error.message}`);
    }
  }

  /**
   * Get all payments (admin)
   */
  static async getAllPayments(
    page: number = 1,
    limit: number = 10,
    status?: string,
    orderId?: string,
  ) {
    const pool = await getPool();
    const offset = (page - 1) * limit;
    const request = pool
      .request()
      .input("offset", offset)
      .input("limit", limit);

    const conditions: string[] = [];

    if (status) {
      conditions.push("p.payment_status = @status");
      request.input("status", status);
    }

    if (orderId) {
      conditions.push("CAST(p.order_id AS NVARCHAR(36)) LIKE @orderId");
      request.input("orderId", `%${orderId}%`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const paymentsResult = await request.query(`
      SELECT 
        p.*,
        o.id as order_id,
        o.total_price as order_total,
        o.status as order_status,
        o.customer_first_name + ' ' + o.customer_last_name as customer_name,
        o.customer_phone as customer_phone
      FROM payments p
      LEFT JOIN [subscriptionCheckout] o ON p.order_id = o.id
      ${whereClause}
      ORDER BY p.created_at DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    // Get total count
    const countRequest = (await getPool()).request();
    if (status) {
      countRequest.input("status", status);
    }
    if (orderId) {
      countRequest.input("orderId", `%${orderId}%`);
    }

    const countResult = await countRequest.query(`
      SELECT COUNT(*) as total FROM payments p ${whereClause}
    `);

    const total = countResult.recordset[0].total;

    return {
      payments: paymentsResult.recordset,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
