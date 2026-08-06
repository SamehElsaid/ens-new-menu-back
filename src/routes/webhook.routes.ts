import { Router } from "express";
import express from "express";
import { handleResendWebhook } from "../controllers/resendWebhook.controller";

const router = Router();

/**
 * Raw body required for Svix signature verification.
 * Mounted at /api/webhooks (see server.ts) BEFORE express.json().
 */
router.post(
  "/resend",
  express.raw({ type: "application/json" }),
  handleResendWebhook,
);

export default router;
