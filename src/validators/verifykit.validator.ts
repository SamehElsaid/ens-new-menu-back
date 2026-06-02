import { z } from "zod";

/** WhatsApp deeplink — no phoneNumber; server uses app "whatsapp" + deeplink. */
export const verifykitStartSchema = z.object({
  lang: z.enum(["en", "ar", "tr", "ru"]).optional(),
  deeplink: z.boolean().optional(),
  qrCode: z.boolean().optional(),
});

export const verifykitCheckSchema = z.object({
  reference: z.string().trim().min(1, "reference is required"),
});

export const verifykitSessionSchema = z.object({
  sessionId: z.string().trim().min(1, "sessionId is required"),
});
