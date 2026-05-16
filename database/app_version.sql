-- App version config (singleton row id = 1).
-- Run once on the target database.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppVersion')
BEGIN
  CREATE TABLE dbo.AppVersion (
    id INT NOT NULL CONSTRAINT PK_AppVersion PRIMARY KEY DEFAULT 1,
    latestVersion NVARCHAR(32) NOT NULL,
    forceUpdate BIT NOT NULL CONSTRAINT DF_AppVersion_forceUpdate DEFAULT 0,
    downloadUrl NVARCHAR(2048) NOT NULL,
    releaseNotes NVARCHAR(MAX) NULL,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppVersion_updatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_AppVersion_singleton CHECK (id = 1)
  );

  INSERT INTO dbo.AppVersion (id, latestVersion, forceUpdate, downloadUrl, releaseNotes)
  VALUES (
    1,
    N'1.2.0',
    0,
    N'https://yourapi.com/downloads/app-v1.2.0.apk',
    N'إضافة ميزة كذا وكذا'
  );
END
GO
