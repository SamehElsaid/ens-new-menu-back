-- App version history (each POST adds a row; latest = ORDER BY id DESC).
-- Run once on the target database.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppVersion')
BEGIN
  CREATE TABLE dbo.AppVersion (
    id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_AppVersion PRIMARY KEY,
    latestVersion NVARCHAR(32) NOT NULL,
    forceUpdate BIT NOT NULL CONSTRAINT DF_AppVersion_forceUpdate DEFAULT 0,
    downloadUrl NVARCHAR(2048) NOT NULL,
    releaseNotes_ar NVARCHAR(MAX) NULL,
    releaseNotes_en NVARCHAR(MAX) NULL,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppVersion_updatedAt DEFAULT SYSUTCDATETIME()
  );

  INSERT INTO dbo.AppVersion (
    latestVersion,
    forceUpdate,
    downloadUrl,
    releaseNotes_ar,
    releaseNotes_en
  )
  VALUES (
    N'1.0.1',
    1,
    N'https://expo.dev/artifacts/eas/wxaLbtLJua6VmHjMGTr9CW.apk',
    N'إضافة ميزة تثبيت التحديثات التلقائية',
    N'Added feature to install updates automatically'
  );
END
GO
