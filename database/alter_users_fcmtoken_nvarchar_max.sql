-- Multiple FCM tokens are stored as a JSON array string (e.g. ["token1","token2"]).
-- If fcmToken is still NVARCHAR(512) or similar, widen so the column can hold many devices.
IF COL_LENGTH(N'dbo.Users', N'fcmToken') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Users ALTER COLUMN fcmToken NVARCHAR(MAX) NULL;
END
