/*
  ENSmenu — analytics, free-banner events, follow-up calls, admin permissions.
  Tables are also created at runtime by analyticsSchema.service.ts.
  Run once in SSMS if you prefer manual migration.
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.MenuViewEvents', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.MenuViewEvents (
    id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_MenuViewEvents PRIMARY KEY,
    menuId INT NOT NULL,
    viewedAt DATETIME2 NOT NULL CONSTRAINT DF_MenuViewEvents_viewedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_MenuViewEvents_menuId_viewedAt ON dbo.MenuViewEvents (menuId, viewedAt DESC);
  PRINT 'Created dbo.MenuViewEvents';
END
GO

IF OBJECT_ID(N'dbo.MenuItemViewEvents', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.MenuItemViewEvents (
    id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_MenuItemViewEvents PRIMARY KEY,
    menuId INT NOT NULL,
    itemId INT NOT NULL,
    viewedAt DATETIME2 NOT NULL CONSTRAINT DF_MenuItemViewEvents_viewedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_MenuItemViewEvents_menuId_viewedAt ON dbo.MenuItemViewEvents (menuId, viewedAt DESC);
  PRINT 'Created dbo.MenuItemViewEvents';
END
GO

IF OBJECT_ID(N'dbo.MenuBrandingEvents', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.MenuBrandingEvents (
    id BIGINT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_MenuBrandingEvents PRIMARY KEY,
    menuId INT NOT NULL,
    eventType NVARCHAR(20) NOT NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_MenuBrandingEvents_createdAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_MenuBrandingEvents_type CHECK (eventType IN (N'impression', N'click'))
  );
  CREATE INDEX IX_MenuBrandingEvents_menuId_createdAt ON dbo.MenuBrandingEvents (menuId, createdAt DESC);
  CREATE INDEX IX_MenuBrandingEvents_type_createdAt ON dbo.MenuBrandingEvents (eventType, createdAt DESC);
  PRINT 'Created dbo.MenuBrandingEvents';
END
GO

IF OBJECT_ID(N'dbo.AdminFollowUpCalls', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AdminFollowUpCalls (
    id NVARCHAR(36) NOT NULL CONSTRAINT PK_AdminFollowUpCalls PRIMARY KEY,
    userId INT NOT NULL,
    adminId INT NULL,
    adminName NVARCHAR(255) NOT NULL,
    outcome NVARCHAR(50) NOT NULL,
    purpose NVARCHAR(50) NULL,
    notes NVARCHAR(MAX) NULL,
    calledAt DATETIME2 NOT NULL CONSTRAINT DF_AdminFollowUpCalls_calledAt DEFAULT SYSUTCDATETIME(),
    nextFollowUpAt DATE NULL
  );
  CREATE INDEX IX_AdminFollowUpCalls_userId ON dbo.AdminFollowUpCalls (userId, calledAt DESC);
  CREATE INDEX IX_AdminFollowUpCalls_calledAt ON dbo.AdminFollowUpCalls (calledAt DESC);
  PRINT 'Created dbo.AdminFollowUpCalls';
END
GO

IF OBJECT_ID(N'dbo.AdminPermissions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AdminPermissions (
    adminUserId INT NOT NULL CONSTRAINT PK_AdminPermissions PRIMARY KEY,
    permissionsJson NVARCHAR(MAX) NULL,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminPermissions_updatedAt DEFAULT SYSUTCDATETIME()
  );
  PRINT 'Created dbo.AdminPermissions';
END
GO

IF COL_LENGTH(N'dbo.Menus', N'viewCount') IS NULL
BEGIN
  ALTER TABLE dbo.Menus ADD viewCount INT NOT NULL CONSTRAINT DF_Menus_viewCount DEFAULT 0;
  PRINT 'Added Menus.viewCount';
END
GO

IF COL_LENGTH(N'dbo.Menus', N'qrScanCount') IS NULL
BEGIN
  ALTER TABLE dbo.Menus ADD qrScanCount INT NOT NULL CONSTRAINT DF_Menus_qrScanCount DEFAULT 0;
  PRINT 'Added Menus.qrScanCount';
END
GO
