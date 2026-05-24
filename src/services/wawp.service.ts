import { logger } from "../utils/logger";

const WAWP_BASE_URL = "https://api.wawp.net";
const WAWP_INSTANCE_ID = process.env.WAWP_INSTANCE_ID?.trim() || "";
const WAWP_ACCESS_TOKEN = process.env.WAWP_ACCESS_TOKEN?.trim() || "";

export function isWawpConfigured(): boolean {
  return Boolean(WAWP_INSTANCE_ID && WAWP_ACCESS_TOKEN);
}

/** Normalize phone to Wawp chatId format, e.g. 201234567890@c.us */
export function formatPhoneToChatId(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Invalid phone number");
  }
  return `${digits}@c.us`;
}

export async function sendWhatsAppText(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  if (!isWawpConfigured()) {
    logger.error(
      "Wawp not configured: WAWP_INSTANCE_ID and WAWP_ACCESS_TOKEN are required",
    );
    return false;
  }

  let chatId: string;
  try {
    chatId = formatPhoneToChatId(phoneNumber);
  } catch {
    logger.error("Wawp: invalid phone number format", { phoneNumber });
    return false;
  }

  const params = new URLSearchParams({
    instance_id: WAWP_INSTANCE_ID,
    access_token: WAWP_ACCESS_TOKEN,
  });

  try {
    const response = await fetch(
      `${WAWP_BASE_URL}/v2/send/text?${params.toString()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error("Wawp send failed", {
        status: response.status,
        body,
        chatId,
      });
      return false;
    }

    logger.info(`WhatsApp message sent via Wawp to ${chatId}`);
    return true;
  } catch (error) {
    logger.error("Wawp send error:", error);
    return false;
  }
}

export async function sendPhoneVerificationWhatsApp(
  phoneNumber: string,
  name: string,
  code: string,
  locale: "ar" | "en" = "ar",
): Promise<boolean> {
  const isArabic = locale === "ar";
  const message = isArabic
    ? `مرحباً ${name} 👋\n\nرمز التحقق الخاص بك في ensmenu هو:\n\n*${code}*\n\nصالح لمدة 10 دقائق.\nلا تشارك هذا الرمز مع أي شخص.`
    : `Hello ${name} 👋\n\nYour ensmenu verification code is:\n\n*${code}*\n\nValid for 10 minutes.\nDo not share this code with anyone.`;

  return sendWhatsAppText(phoneNumber, message);
}
