import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";

export async function ensurePhoneVerifiedSchema(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF COL_LENGTH('Users', 'isPhoneVerified') IS NULL
    BEGIN
      ALTER TABLE Users
        ADD isPhoneVerified BIT NOT NULL
          CONSTRAINT DF_Users_isPhoneVerified DEFAULT 0;
    END

    IF COL_LENGTH('Users', 'phoneVerifiedAt') IS NULL
    BEGIN
      ALTER TABLE Users ADD phoneVerifiedAt DATETIME2 NULL;
    END
  `);
}

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
