-- Activity / audit log per menu (products, staff, settings, table orders).
-- Run once on the target database.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MenuActivityLog')
BEGIN
  CREATE TABLE dbo.MenuActivityLog (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    menuId INT NOT NULL,
    actorRole NVARCHAR(32) NOT NULL,
    actorName NVARCHAR(255) NOT NULL,
    actorStaffJobRole NVARCHAR(64) NULL,
    action NVARCHAR(64) NOT NULL,
    targetType NVARCHAR(32) NULL,
    targetId INT NULL,
    summaryAr NVARCHAR(1000) NULL,
    summaryEn NVARCHAR(1000) NULL,
    detailJson NVARCHAR(MAX) NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_MenuActivityLog_createdAt DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_MenuActivityLog_menuId_createdAt
    ON dbo.MenuActivityLog (menuId, createdAt DESC);
END
GO
