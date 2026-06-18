import { getPool } from "../config/database";
import { logger } from "../utils/logger";

export async function ensureMenuAuditLogSchema(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.MenuAuditLog', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MenuAuditLog (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MenuAuditLog PRIMARY KEY,
        menuId INT NOT NULL,
        action NVARCHAR(100) NOT NULL,
        targetType NVARCHAR(50) NOT NULL,
        targetId INT NULL,
        summaryAr NVARCHAR(500) NOT NULL,
        summaryEn NVARCHAR(500) NOT NULL,
        detailJson NVARCHAR(MAX) NULL,
        actorRole NVARCHAR(50) NOT NULL,
        actorName NVARCHAR(255) NOT NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_MenuAuditLog_createdAt DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_MenuAuditLog_menuId_createdAt ON dbo.MenuAuditLog (menuId, createdAt DESC);
      CREATE INDEX IX_MenuAuditLog_action ON dbo.MenuAuditLog (menuId, action, createdAt DESC);
    END
  `);
  logger.info("Menu audit log schema ensured");
}
