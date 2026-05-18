-- Migrate AppVersion.releaseNotes -> releaseNotes_ar / releaseNotes_en
-- and apply v1.0.1 config. Safe to run multiple times.

IF COL_LENGTH(N'dbo.AppVersion', N'releaseNotes_ar') IS NULL
BEGIN
  ALTER TABLE dbo.AppVersion ADD releaseNotes_ar NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH(N'dbo.AppVersion', N'releaseNotes_en') IS NULL
BEGIN
  ALTER TABLE dbo.AppVersion ADD releaseNotes_en NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH(N'dbo.AppVersion', N'releaseNotes') IS NOT NULL
BEGIN
  UPDATE dbo.AppVersion
  SET releaseNotes_ar = COALESCE(releaseNotes_ar, releaseNotes)
  WHERE id = 1 AND releaseNotes IS NOT NULL;

  ALTER TABLE dbo.AppVersion DROP COLUMN releaseNotes;
END
GO

IF EXISTS (SELECT 1 FROM dbo.AppVersion WHERE id = 1)
BEGIN
  UPDATE dbo.AppVersion
  SET
    latestVersion = N'1.0.1',
    forceUpdate = 1,
    downloadUrl = N'https://expo.dev/artifacts/eas/wxaLbtLJua6VmHjMGTr9CW.apk',
    releaseNotes_ar = N'إضافة ميزة تثبيت التحديثات التلقائية',
    releaseNotes_en = N'Added feature to install updates automatically',
    updatedAt = SYSUTCDATETIME()
  WHERE id = 1;
END
ELSE IF EXISTS (SELECT * FROM sys.tables WHERE name = N'AppVersion')
BEGIN
  INSERT INTO dbo.AppVersion (
    id,
    latestVersion,
    forceUpdate,
    downloadUrl,
    releaseNotes_ar,
    releaseNotes_en
  )
  VALUES (
    1,
    N'1.0.1',
    1,
    N'https://expo.dev/artifacts/eas/wxaLbtLJua6VmHjMGTr9CW.apk',
    N'إضافة ميزة تثبيت التحديثات التلقائية',
    N'Added feature to install updates automatically'
  );
END
GO
