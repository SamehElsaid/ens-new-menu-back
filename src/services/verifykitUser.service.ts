import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import { ensurePhoneVerifiedSchema } from "../schemas/phoneVerified.schema";

export async function markUserPhoneVerified(
  userId: number,
  phoneNumber: string,
  countryCode?: string | null,
): Promise<void> {
  await ensurePhoneVerifiedSchema();

  const pool = await getPool();
  const request = pool
    .request()
    .input("userId", sql.Int, userId)
    .input("phoneNumber", sql.NVarChar, phoneNumber);

  const country = countryCode?.trim();
  if (country) {
    request.input("country", sql.NVarChar, country);
    await request.query(`
      UPDATE Users
      SET
        phoneNumber = @phoneNumber,
        country = @country,
        isPhoneVerified = 1,
        phoneVerifiedAt = GETDATE()
      WHERE id = @userId
    `);
  } else {
    await request.query(`
      UPDATE Users
      SET
        phoneNumber = @phoneNumber,
        isPhoneVerified = 1,
        phoneVerifiedAt = GETDATE()
      WHERE id = @userId
    `);
  }

  logger.info("User phone verified via VerifyKit", { userId });
}
