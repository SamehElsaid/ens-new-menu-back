import { Response } from "express";
import { AuthRequest } from "../types/index";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import {
  validateVoucherForUser,
  redeemDurationVoucher,
} from "../services/voucher.service";
import {
  resolveProMonthlyCheckoutAmount,
  resolveProYearlyCheckoutAmount,
} from "../config/proYearlyPricing";
import { getPool } from "../config/database";

export const validateVoucherHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (userId == null) {
      throw new ApiError(401, "Authentication required");
    }

    const { code, billingCycle } = req.body as {
      code?: string;
      billingCycle?: "monthly" | "yearly";
    };

    if (!code?.trim()) {
      throw new ApiError(
        400,
        "Voucher code is required",
        true,
        "كود الخصم مطلوب",
      );
    }

    let originalPrice: number | undefined;
    if (billingCycle === "monthly" || billingCycle === "yearly") {
      const pool = await getPool();
      const planResult = await pool.request().query(`
        SELECT TOP 1 priceMonthly, priceYearly
        FROM Plans
        WHERE isActive = 1 AND LOWER(LTRIM(RTRIM(name))) = N'pro'
      `);
      if (planResult.recordset.length === 0) {
        throw new ApiError(404, "Pro plan not found");
      }
      const plan = planResult.recordset[0];
      if (billingCycle === "monthly") {
        const checkout = await resolveProMonthlyCheckoutAmount(
          pool,
          userId,
          Number(plan.priceMonthly),
        );
        originalPrice = checkout.amount;
      } else {
        const checkout = await resolveProYearlyCheckoutAmount(
          pool,
          userId,
          Number(plan.priceYearly),
          Number(plan.priceMonthly),
        );
        originalPrice = checkout.amount;
      }
    }

    const result = await validateVoucherForUser(
      code.trim(),
      userId,
      originalPrice,
      billingCycle,
    );

    res.json({
      success: true,
      data: result,
    });
  },
);

export const redeemDurationVoucherHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (userId == null) {
      throw new ApiError(401, "Authentication required");
    }

    const { code } = req.body as { code?: string };
    if (!code?.trim()) {
      throw new ApiError(
        400,
        "Voucher code is required",
        true,
        "كود الخصم مطلوب",
      );
    }

    const result = await redeemDurationVoucher(code.trim(), userId);

    res.json({
      success: true,
      data: result,
      message: result.extended
        ? "Subscription extended successfully"
        : "Free subscription activated successfully",
    });
  },
);
