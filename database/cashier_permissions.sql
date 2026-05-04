-- Linked dashboard users: menus + page grants (cashier today; same tables for future roles under an owner).
-- Run on SQL Server after backup.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Users') AND name = 'ownerUserId'
)
BEGIN
  ALTER TABLE dbo.Users ADD ownerUserId INT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Users_OwnerUser')
BEGIN
  ALTER TABLE dbo.Users
    ADD CONSTRAINT FK_Users_OwnerUser
    FOREIGN KEY (ownerUserId) REFERENCES dbo.Users(id);
END;
GO

-- Generic ACL: one row per linked user + menu (role is implied by Users.role — e.g. cashier, future manager, …)
IF OBJECT_ID(N'dbo.UserMenuPermission', N'U') IS NULL
BEGIN
  IF OBJECT_ID(N'dbo.CashierMenuAccess', N'U') IS NOT NULL
  BEGIN
    -- Legacy rename (if you ran an older script)
    EXEC sp_rename N'dbo.CashierMenuAccess', N'UserMenuPermission';
  END
  ELSE
  BEGIN
    -- SQL Server allows only one CASCADE path between two tables. Menus -> Users often cascades,
    -- so CASCADE on both userId and menuId here would create multiple cascade paths to this table.
    -- CASCADE on user: removing a linked user drops their rows. Menu side is NO ACTION:
    -- delete UMP for that menu in app (see deleteMenu) before deleting the menu.
    CREATE TABLE dbo.UserMenuPermission (
      userId INT NOT NULL,
      menuId INT NOT NULL,
      CONSTRAINT PK_UserMenuPermission PRIMARY KEY (userId, menuId),
      CONSTRAINT FK_UMP_User FOREIGN KEY (userId) REFERENCES dbo.Users(id) ON DELETE CASCADE,
      CONSTRAINT FK_UMP_Menu FOREIGN KEY (menuId) REFERENCES dbo.Menus(id) ON DELETE NO ACTION
    );
  END
END;
GO

-- If legacy table was renamed, column may still be cashierUserId
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.UserMenuPermission') AND name = N'cashierUserId'
)
BEGIN
  EXEC sp_rename N'dbo.UserMenuPermission.cashierUserId', N'userId', N'COLUMN';
END;
GO

IF OBJECT_ID(N'dbo.UserDashboardPagePermission', N'U') IS NULL
BEGIN
  IF OBJECT_ID(N'dbo.CashierPagePermission', N'U') IS NOT NULL
  BEGIN
    EXEC sp_rename N'dbo.CashierPagePermission', N'UserDashboardPagePermission';
  END
  ELSE
  BEGIN
    CREATE TABLE dbo.UserDashboardPagePermission (
      userId INT NOT NULL,
      pageKey NVARCHAR(64) NOT NULL,
      CONSTRAINT PK_UserDashboardPagePermission PRIMARY KEY (userId, pageKey),
      CONSTRAINT FK_UDPP_User FOREIGN KEY (userId) REFERENCES dbo.Users(id) ON DELETE CASCADE
    );
  END
END;
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.UserDashboardPagePermission') AND name = N'cashierUserId'
)
BEGIN
  EXEC sp_rename N'dbo.UserDashboardPagePermission.cashierUserId', N'userId', N'COLUMN';
END;
GO
