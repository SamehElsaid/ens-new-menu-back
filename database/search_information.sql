-- Singleton search information (bilingual title + description)
IF OBJECT_ID(N'dbo.SearchInformation', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SearchInformation (
    id INT NOT NULL CONSTRAINT PK_SearchInformation PRIMARY KEY DEFAULT 1,
    titleAr NVARCHAR(512) NOT NULL CONSTRAINT DF_SearchInformation_titleAr DEFAULT N'',
    titleEn NVARCHAR(512) NOT NULL CONSTRAINT DF_SearchInformation_titleEn DEFAULT N'',
    descriptionAr NVARCHAR(MAX) NOT NULL CONSTRAINT DF_SearchInformation_descriptionAr DEFAULT N'',
    descriptionEn NVARCHAR(MAX) NOT NULL CONSTRAINT DF_SearchInformation_descriptionEn DEFAULT N'',
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_SearchInformation_updatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_SearchInformation_singleton CHECK (id = 1)
  );

  INSERT INTO dbo.SearchInformation (
    id,
    titleAr,
    titleEn,
    descriptionAr,
    descriptionEn,
    updatedAt
  )
  VALUES (1, N'', N'', N'', N'', SYSUTCDATETIME());
END
