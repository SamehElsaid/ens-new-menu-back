import { getPool } from "../config/database";

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
