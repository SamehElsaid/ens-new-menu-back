import { z } from "zod";

/** WhatsApp OTP — phone number required; app is always "whatsapp" on the server. */
export const verifykitWhatsAppStartSchema = z.object({
  phoneNumber: z.string().trim().min(5).max(20),
  lang: z.enum(["en", "ar", "tr", "ru"]).optional(),
});

export const verifykitCheckWhatsAppSchema = z.object({
  reference: z.string().trim().min(1, "reference is required"),
  code: z.string().trim().min(4).max(10),
});

export const verifykitSessionSchema = z.object({
  sessionId: z.string().trim().min(1, "sessionId is required"),
});
