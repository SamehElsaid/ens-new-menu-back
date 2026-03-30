-- Staff guest table calls (persisted for staff who connect later)
-- Table is created in database **SaasMenu** (same as DB_NAME in .env / production).
-- If your database name differs, change USE below or run this script after selecting the correct DB.

USE [SaasMenu];
GO

-- No FOREIGN KEY to Menus: some deployments use a non-dbo schema or different naming;
-- the API already validates menuId before insert. If dbo.Menus(id) exists, you may add:
--   ALTER TABLE dbo.StaffTableCalls ADD CONSTRAINT FK_StaffTableCalls_Menus
--     FOREIGN KEY (menuId) REFERENCES dbo.Menus (id);

IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'StaffTableCalls' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.StaffTableCalls (
    id INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    menuId INT NOT NULL,
    tableNumber NVARCHAR(50) NOT NULL,
    createdAt DATETIME2(3) NOT NULL CONSTRAINT DF_StaffTableCalls_createdAt DEFAULT (SYSUTCDATETIME()),
    acknowledgedAt DATETIME2(3) NULL
  );

  CREATE INDEX IX_StaffTableCalls_menu_pending
    ON dbo.StaffTableCalls (menuId, acknowledgedAt)
    INCLUDE (tableNumber, createdAt);
END
GO
