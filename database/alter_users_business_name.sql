-- Add business name captured at signup
IF COL_LENGTH(N'dbo.Users', N'businessName') IS NULL
BEGIN
  ALTER TABLE dbo.Users
    ADD businessName NVARCHAR(255) NULL;
END
GO
