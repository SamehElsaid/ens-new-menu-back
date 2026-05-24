import { getPool } from "../config/database";
import { logger } from "../utils/logger";

export async function ensurePhoneVerificationSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.Users')
        AND name = N'isPhoneVerified'
    )
    BEGIN
      ALTER TABLE dbo.Users
        ADD isPhoneVerified BIT NOT NULL
          CONSTRAINT DF_Users_isPhoneVerified DEFAULT 0;
    END
  `);

  await pool.request().query(`
    UPDATE dbo.Users
    SET isPhoneVerified = 1
    WHERE isPhoneVerified = 0
      AND phoneNumber IS NOT NULL
      AND LTRIM(RTRIM(phoneNumber)) <> ''
      AND createdAt < DATEADD(MINUTE, -1, GETDATE());
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.PhoneVerifications', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PhoneVerifications (
        id INT IDENTITY(1, 1) NOT NULL
          CONSTRAINT PK_PhoneVerifications PRIMARY KEY,
        userId INT NOT NULL
          CONSTRAINT FK_PhoneVerifications_Users
          REFERENCES dbo.Users(id) ON DELETE CASCADE,
        code NVARCHAR(6) NOT NULL,
        expiresAt DATETIME2 NOT NULL,
        createdAt DATETIME2 NOT NULL
          CONSTRAINT DF_PhoneVerifications_createdAt DEFAULT GETDATE()
      );

      CREATE INDEX IX_PhoneVerifications_userId
        ON dbo.PhoneVerifications(userId);
    END
  `);

  logger.info("Phone verification schema ensured");
}
