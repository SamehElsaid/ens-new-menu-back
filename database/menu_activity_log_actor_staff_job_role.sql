-- Adds optional staff job role (cashier / waiter) for activity log rows.
IF OBJECT_ID(N'dbo.MenuActivityLog', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.MenuActivityLog', N'actorStaffJobRole') IS NULL
BEGIN
  ALTER TABLE dbo.MenuActivityLog ADD actorStaffJobRole NVARCHAR(64) NULL;
END
GO
