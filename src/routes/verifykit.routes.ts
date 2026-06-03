import { Router } from "express";
import * as verifykitController from "../controllers/verifykit.controller";
import { validateRequest } from "../middleware/zodValidation";
import { authLimiter } from "../middleware/rateLimiter";
import {
  optionalAuth,
  requireAuth,
} from "../middleware/auth.middleware";
import {
  verifykitCheckSchema,
  verifykitSessionSchema,
  verifykitStartSchema,
} from "../validators/verifykit.validator";

const router = Router();

router.use(authLimiter);

// POST /api/verifykit/start — WhatsApp deeplink (reference + deeplink / qrCode)
router.post(
  "/start",
  validateRequest(verifykitStartSchema, "body"),
  verifykitController.startWhatsAppDeeplink,
);

// POST /api/verifykit/check — poll after user sends WhatsApp message
router.post(
  "/check",
  optionalAuth,
  validateRequest(verifykitCheckSchema, "body"),
  verifykitController.checkValidation,
);

// POST /api/verifykit/result — verified phone number from sessionId
router.post(
  "/result",
  optionalAuth,
  validateRequest(verifykitSessionSchema, "body"),
  verifykitController.getResult,
);

// POST /api/verifykit/complete — save phone + isPhoneVerified (requires login)
router.post(
  "/complete",
  requireAuth,
  validateRequest(verifykitSessionSchema, "body"),
  verifykitController.completePhoneVerification,
);

export default router;
