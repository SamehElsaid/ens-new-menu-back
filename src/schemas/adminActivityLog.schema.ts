import { getPool } from "../config/database";
import { logger } from "../utils/logger";

export async function ensureAdminActivityLogSchema(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.AdminActivityLog', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AdminActivityLog (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AdminActivityLog PRIMARY KEY,
        actorAdminId INT NULL,
        actorAdminName NVARCHAR(255) NOT NULL,
        action NVARCHAR(100) NOT NULL,
        targetType NVARCHAR(20) NOT NULL,
        targetId INT NOT NULL,
        targetName NVARCHAR(255) NOT NULL,
        targetEmail NVARCHAR(255) NULL,
        details NVARCHAR(MAX) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_AdminActivityLog_createdAt DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_AdminActivityLog_createdAt ON dbo.AdminActivityLog (createdAt DESC);
      CREATE INDEX IX_AdminActivityLog_action ON dbo.AdminActivityLog (action, createdAt DESC);
    END
  `);
  logger.info("Admin activity log schema ensured");
}
