import { Request, Response } from "express";
import { getResendClient } from "../config/email";
import {
  forwardInboundEmailToGmail,
  type InboundReceivedMeta,
} from "../services/inboundEmailForward.service";
import { logger } from "../utils/logger";

function getWebhookSecret(): string {
  return process.env.RESEND_WEBHOOK_SECRET?.trim() || "";
}

/**
 * Resend inbound webhook. Expects raw Buffer body (express.raw) for Svix verify.
 */
export async function handleResendWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const secret = getWebhookSecret();
  if (!secret) {
    logger.error("RESEND_WEBHOOK_SECRET is not configured");
    res.status(500).json({ success: false, message: "Webhook not configured" });
    return;
  }

  const resend = getResendClient();
  if (!resend) {
    logger.error("RESEND_API_KEY is not configured");
    res.status(500).json({ success: false, message: "Email not configured" });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";

  if (!rawBody) {
    res.status(400).json({ success: false, message: "Empty body" });
    return;
  }

  const svixId = req.headers["svix-id"];
  const svixTimestamp = req.headers["svix-timestamp"];
  const svixSignature = req.headers["svix-signature"];

  if (
    typeof svixId !== "string" ||
    typeof svixTimestamp !== "string" ||
    typeof svixSignature !== "string"
  ) {
    res.status(400).json({ success: false, message: "Missing svix headers" });
    return;
  }

  let event: ReturnType<typeof resend.webhooks.verify>;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret: secret,
    });
  } catch (error) {
    logger.warn("Resend webhook signature verification failed", { error });
    res.status(400).json({ success: false, message: "Invalid signature" });
    return;
  }

  if (event.type !== "email.received") {
    logger.debug("Ignoring Resend webhook event", { type: event.type });
    res.status(200).json({ success: true, ignored: true, type: event.type });
    return;
  }

  const data = event.data as InboundReceivedMeta & {
    received_for?: string[];
  };

  try {
    const result = await forwardInboundEmailToGmail({
      email_id: data.email_id,
      from: data.from,
      to: data.to || [],
      subject: data.subject || "",
      message_id: data.message_id,
      received_for: data.received_for,
      attachments: data.attachments,
    });

    if (!result.ok) {
      // 500 so Resend retries (dedupe claim prevents double-send after success)
      res.status(500).json({
        success: false,
        message: "Forward failed",
        reason: result.reason,
      });
      return;
    }

    res.status(200).json({
      success: true,
      skipped: Boolean(result.skipped),
      reason: result.reason,
    });
  } catch (error) {
    logger.error("Failed processing email.received webhook", {
      emailId: data.email_id,
      error,
    });
    res.status(500).json({ success: false, message: "Processing error" });
  }
}
