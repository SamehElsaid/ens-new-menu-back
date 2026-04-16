/*
  Order lifecycle: pending → confirmed | cancelled.
  Run once per environment against the API database.
*/
IF COL_LENGTH('dbo.StaffTableCalls', 'status') IS NULL
BEGIN
  ALTER TABLE dbo.StaffTableCalls ADD status NVARCHAR(20) NULL;
END
GO

UPDATE dbo.StaffTableCalls
SET status = CASE
  WHEN acknowledgedAt IS NOT NULL THEN N'confirmed'
  ELSE N'pending'
END
WHERE status IS NULL;
GO
