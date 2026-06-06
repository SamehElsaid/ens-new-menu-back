import { Request, Response, NextFunction } from "express";
import { validationResult, ValidationChain, body } from "express-validator";
import { pickLocalized } from "../utils/apiErrorResponse";

/** Payment: generic order checkout (e.g. menu orders) */
export const initiatePaymentSchema: ValidationChain[] = [
  body("order_id").isString().notEmpty().withMessage("order_id is required"),
  body("amount")
    .isFloat({ min: 0.01 })
    .withMessage("amount must be a positive number"),
  body("name").isString().notEmpty().trim().withMessage("name is required"),
  body("email").optional().isString().trim(),
  body("mobile")
    .isString()
    .notEmpty()
    .trim()
    .withMessage("mobile is required"),
  body("currency").optional().isString().trim(),
  body("redirectUrl").optional().isString().trim(),
  body("customerReference").optional().isString().trim(),
];

/** EasyKash callback body varies by product; accept and validate in service. */
export const paymentCallbackSchema: ValidationChain[] = [];

/** Pro plan — yearly subscription (EasyKash). */
export const subscriptionProYearlySchema: ValidationChain[] = [
  body("name").isString().notEmpty().trim().withMessage("name is required"),
  body("email").optional().isString().trim(),
  body("mobile")
    .isString()
    .notEmpty()
    .trim()
    .withMessage("mobile is required"),
  body("currency").optional().isString().trim(),
  body("redirectUrl").optional().isString().trim(),
  body("voucherCode").optional().isString().trim(),
];

export const voucherValidateSchema: ValidationChain[] = [
  body("code").isString().notEmpty().trim().withMessage("code is required"),
  body("billingCycle")
    .optional()
    .isIn(["monthly", "yearly"])
    .withMessage("billingCycle must be monthly or yearly"),
];

export const voucherRedeemSchema: ValidationChain[] = [
  body("code").isString().notEmpty().trim().withMessage("code is required"),
];

export const adminVoucherSchema: ValidationChain[] = [
  body("code").isString().notEmpty().trim().withMessage("code is required"),
  body("type")
    .isIn(["discount", "duration"])
    .withMessage("type must be discount or duration"),
  body("discountType")
    .optional()
    .isIn(["percentage", "fixed"])
    .withMessage("discountType must be percentage or fixed"),
  body("discountValue").optional().isFloat({ min: 0 }),
  body("durationUnit")
    .optional()
    .isIn(["days", "months"])
    .withMessage("durationUnit must be days or months"),
  body("durationValue").optional().isInt({ min: 1 }),
  body("billingCycle")
    .optional()
    .isIn(["monthly", "yearly", "both"])
    .withMessage("billingCycle must be monthly, yearly, or both"),
  body("maxUses").isInt({ min: 1 }).withMessage("maxUses must be at least 1"),
  body("isActive").optional().isBoolean(),
  body("validFrom").optional().isISO8601(),
  body("validUntil").optional().isISO8601(),
  body("description").optional().isString().trim(),
];

export function validate(validations: ValidationChain[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Run all validations
    for (const validation of validations) {
      await validation.run(req);
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors
        .array()
        .map((err) => {
          const field = err.type === "field" ? err.path : "unknown";
          return `${field}: ${err.msg}`;
        })
        .join(", ");
      const en = `Validation failed: ${errorMessages}`;
      const ar = `فشل التحقق: ${errorMessages}`;
      res.status(400).json({
        error: pickLocalized(req, { en, ar }),
        errorAr: ar,
        errorEn: en,
        details: errors.array().map((err) => ({
          field: err.type === "field" ? err.path : undefined,
          message: err.msg,
        })),
      });
      return;
    }

    next();
  };
}
