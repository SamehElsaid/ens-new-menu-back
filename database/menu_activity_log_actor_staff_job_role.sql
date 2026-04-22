-- Adds optional staff job role (cashier / waiter) for activity log rows.
IF COL_LENGTH(N'dbo.MenuActivityLog', N'actorStaffJobRole') IS NULL
BEGIN
  ALTER TABLE dbo.MenuActivityLog ADD actorStaffJobRole NVARCHAR(64) NULL;
END
GO
