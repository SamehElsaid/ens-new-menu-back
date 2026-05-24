-- Phone verification via WhatsApp (Wawp)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.Users')
    AND name = N'isPhoneVerified'
)
BEGIN
  ALTER TABLE dbo.Users
    ADD isPhoneVerified BIT NOT NULL
      CONSTRAINT DF_Users_isPhoneVerified DEFAULT 0;
END
GO

IF OBJECT_ID(N'dbo.PhoneVerifications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PhoneVerifications (
    id INT IDENTITY(1, 1) NOT NULL
      CONSTRAINT PK_PhoneVerifications PRIMARY KEY,
    userId INT NOT NULL
      CONSTRAINT FK_PhoneVerifications_Users
      REFERENCES dbo.Users(id) ON DELETE CASCADE,
    code NVARCHAR(6) NOT NULL,
    expiresAt DATETIME2 NOT NULL,
    createdAt DATETIME2 NOT NULL
      CONSTRAINT DF_PhoneVerifications_createdAt DEFAULT GETDATE()
  );

  CREATE INDEX IX_PhoneVerifications_userId
    ON dbo.PhoneVerifications(userId);
END
GO
