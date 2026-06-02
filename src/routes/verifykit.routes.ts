import { Router } from "express";
import * as verifykitController from "../controllers/verifykit.controller";
import { validateRequest } from "../middleware/zodValidation";
import { authLimiter } from "../middleware/rateLimiter";
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
  validateRequest(verifykitCheckSchema, "body"),
  verifykitController.checkValidation,
);

// POST /api/verifykit/result — verified phone number from sessionId
router.post(
  "/result",
  validateRequest(verifykitSessionSchema, "body"),
  verifykitController.getResult,
);

export default router;
