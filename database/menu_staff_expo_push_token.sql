-- Adds expoPushToken column to MenuStaff for Expo push notifications.
-- Run once on the target database (SaasMenu).
-- The login API accepts the field as `expoToken` in the request body and
-- stores it here.

IF NOT EXISTS (
  SELECT 1
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'MenuStaff'
    AND COLUMN_NAME = 'expoPushToken'
)
BEGIN
  ALTER TABLE dbo.MenuStaff
    ADD expoPushToken NVARCHAR(256) NULL;
END
GO
