import crypto from "crypto";
import { getPool, sql } from "../config/database";
import { TOKEN_EXPIRY } from "../config/constants";
import { logger } from "../utils/logger";
import { sendPhoneVerificationWhatsApp } from "./wawp.service";

function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function createAndSendPhoneVerification(
  userId: number,
  phoneNumber: string,
  name: string,
  locale: "ar" | "en" = "ar",
): Promise<boolean> {
  const pool = await getPool();
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.PHONE_VERIFICATION);

  await pool
    .request()
    .input("userId", sql.Int, userId)
    .query("DELETE FROM PhoneVerifications WHERE userId = @userId");

  await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("code", sql.NVarChar, code)
    .input("expiresAt", sql.DateTime2, expiresAt)
    .query(`
      INSERT INTO PhoneVerifications (userId, code, expiresAt)
      VALUES (@userId, @code, @expiresAt)
    `);

  const sent = await sendPhoneVerificationWhatsApp(
    phoneNumber,
    name,
    code,
    locale,
  );

  if (!sent) {
    logger.warn("Phone verification OTP created but WhatsApp delivery failed", {
      userId,
    });
  }

  return sent;
}

export async function verifyPhoneCode(
  phoneNumber: string,
  code: string,
): Promise<{ success: boolean; reason?: "not_found" | "already_verified" | "invalid" }> {
  const pool = await getPool();

  const userResult = await pool
    .request()
    .input("phoneNumber", sql.NVarChar, phoneNumber)
    .query(`
      SELECT id, isPhoneVerified
      FROM Users
      WHERE phoneNumber = @phoneNumber
    `);

  if (userResult.recordset.length === 0) {
    return { success: false, reason: "not_found" };
  }

  const user = userResult.recordset[0];

  if (user.isPhoneVerified) {
    return { success: false, reason: "already_verified" };
  }

  const verificationResult = await pool
    .request()
    .input("userId", sql.Int, user.id)
    .input("code", sql.NVarChar, code.trim())
    .query(`
      SELECT id FROM PhoneVerifications
      WHERE userId = @userId
        AND code = @code
        AND expiresAt > GETDATE()
    `);

  if (verificationResult.recordset.length === 0) {
    return { success: false, reason: "invalid" };
  }

  await pool
    .request()
    .input("userId", sql.Int, user.id)
    .query(`
      UPDATE Users
      SET isPhoneVerified = 1
      WHERE id = @userId
    `);

  await pool
    .request()
    .input("userId", sql.Int, user.id)
    .query("DELETE FROM PhoneVerifications WHERE userId = @userId");

  return { success: true };
}
