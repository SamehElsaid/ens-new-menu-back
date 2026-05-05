-- Order activity log per menu.
-- Each order has details JSON + actions JSON array.
-- Run once on the target database.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MenuOrders')
BEGIN
  CREATE TABLE dbo.MenuOrders (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    menuId INT NOT NULL,
    orderId INT NOT NULL,
    orderJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_MenuOrders_orderJson DEFAULT N'{}',
    actionsJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_MenuOrders_actionsJson DEFAULT N'[]',
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_MenuOrders_createdAt DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NULL
  );

  CREATE UNIQUE INDEX UX_MenuOrders_menuId_orderId
    ON dbo.MenuOrders (menuId, orderId);

  CREATE INDEX IX_MenuOrders_menuId_updatedAt
    ON dbo.MenuOrders (menuId, updatedAt DESC, createdAt DESC);
END
GO

IF OBJECT_ID(N'dbo.MenuOrders', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_MenuOrders_orderJson_IsJson'
  )
  BEGIN
    ALTER TABLE dbo.MenuOrders
      ADD CONSTRAINT CK_MenuOrders_orderJson_IsJson
      CHECK (ISJSON(orderJson) = 1);
  END

  IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_MenuOrders_actionsJson_IsJson'
  )
  BEGIN
    ALTER TABLE dbo.MenuOrders
      ADD CONSTRAINT CK_MenuOrders_actionsJson_IsJson
      CHECK (ISJSON(actionsJson) = 1);
  END
END
GO
