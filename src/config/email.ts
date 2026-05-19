import { Resend } from "resend";
import { logger } from "../utils/logger";

let resendClient: Resend | null = null;
let cachedApiKey: string | null = null;

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  if (!apiKey) {
    return null;
  }
  if (!resendClient || cachedApiKey !== apiKey) {
    resendClient = new Resend(apiKey);
    cachedApiKey = apiKey;
  }
  return resendClient;
}

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim(),
  );
}

export async function testEmailConnection(): Promise<boolean> {
  if (!isEmailConfigured()) {
    logger.warn(
      "Email not configured: set RESEND_API_KEY and EMAIL_FROM in .env",
    );
    return false;
  }
  return true;
}
