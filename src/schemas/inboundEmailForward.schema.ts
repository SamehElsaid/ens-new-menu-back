import { getPool } from "../config/database";
import { logger } from "../utils/logger";

/** Idempotent schema for inbound email → Gmail forward dedupe. */
export async function ensureInboundEmailForwardSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.InboundEmailForwards', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.InboundEmailForwards (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_InboundEmailForwards PRIMARY KEY,
        resendEmailId NVARCHAR(100) NOT NULL,
        fromAddress NVARCHAR(320) NOT NULL,
        subject NVARCHAR(998) NULL,
        forwardTo NVARCHAR(320) NOT NULL,
        outboundResendId NVARCHAR(100) NULL,
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_InboundEmailForwards_status DEFAULT N'processing',
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_InboundEmailForwards_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_InboundEmailForwards_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_InboundEmailForwards_resendEmailId UNIQUE (resendEmailId),
        CONSTRAINT CK_InboundEmailForwards_status CHECK (
          status IN (N'processing', N'forwarded', N'failed', N'skipped')
        )
      );
      CREATE INDEX IX_InboundEmailForwards_createdAt
        ON dbo.InboundEmailForwards (createdAt DESC);
    END
  `);

  logger.info("Inbound email forward schema ensured");
}
