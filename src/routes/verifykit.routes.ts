import { Router } from "express";
import * as verifykitController from "../controllers/verifykit.controller";
import { validateRequest } from "../middleware/zodValidation";
import { authLimiter } from "../middleware/rateLimiter";
import {
  verifykitCheckWhatsAppSchema,
  verifykitSessionSchema,
  verifykitWhatsAppStartSchema,
} from "../validators/verifykit.validator";

const router = Router();

router.use(authLimiter);

// POST /api/verifykit/start — send WhatsApp OTP to phoneNumber
router.post(
  "/start",
  validateRequest(verifykitWhatsAppStartSchema, "body"),
  verifykitController.startWhatsAppOtp,
);

// POST /api/verifykit/check-whatsapp — verify OTP code
router.post(
  "/check-whatsapp",
  validateRequest(verifykitCheckWhatsAppSchema, "body"),
  verifykitController.checkWhatsAppOtp,
);

// POST /api/verifykit/result — fetch verified phone number by sessionId
router.post(
  "/result",
  validateRequest(verifykitSessionSchema, "body"),
  verifykitController.getResult,
);

export default router;
