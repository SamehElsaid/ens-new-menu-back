-- Allow multiple AppVersion rows (POST adds new, GET returns latest by id DESC).
-- Safe to run multiple times.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = N'AppVersion')
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
END
ELSE IF NOT EXISTS (
  SELECT 1
  FROM sys.columns c
  INNER JOIN sys.tables t ON c.object_id = t.object_id
  WHERE t.name = N'AppVersion' AND c.name = N'id' AND c.is_identity = 1
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_AppVersion_singleton' AND parent_object_id = OBJECT_ID(N'dbo.AppVersion')
  )
  BEGIN
    ALTER TABLE dbo.AppVersion DROP CONSTRAINT CK_AppVersion_singleton;
  END

  CREATE TABLE dbo.AppVersion_new (
    id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_AppVersion_new PRIMARY KEY,
    latestVersion NVARCHAR(32) NOT NULL,
    forceUpdate BIT NOT NULL CONSTRAINT DF_AppVersion_new_forceUpdate DEFAULT 0,
    downloadUrl NVARCHAR(2048) NOT NULL,
    releaseNotes_ar NVARCHAR(MAX) NULL,
    releaseNotes_en NVARCHAR(MAX) NULL,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppVersion_new_updatedAt DEFAULT SYSUTCDATETIME()
  );

  INSERT INTO dbo.AppVersion_new (
    latestVersion,
    forceUpdate,
    downloadUrl,
    releaseNotes_ar,
    releaseNotes_en,
    updatedAt
  )
  SELECT
    latestVersion,
    forceUpdate,
    downloadUrl,
    releaseNotes_ar,
    releaseNotes_en,
    updatedAt
  FROM dbo.AppVersion;

  DROP TABLE dbo.AppVersion;

  EXEC sp_rename N'dbo.AppVersion_new', N'AppVersion';
  EXEC sp_rename N'PK_AppVersion_new', N'PK_AppVersion', N'OBJECT';
END
ELSE IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_AppVersion_singleton' AND parent_object_id = OBJECT_ID(N'dbo.AppVersion')
)
BEGIN
  ALTER TABLE dbo.AppVersion DROP CONSTRAINT CK_AppVersion_singleton;
END
GO
