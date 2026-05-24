-- Singleton promo settings (text + boolean flag)
IF OBJECT_ID(N'dbo.Promo', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Promo (
    id INT NOT NULL CONSTRAINT PK_Promo PRIMARY KEY DEFAULT 1,
    text NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Promo_text DEFAULT N'',
    [boolean] BIT NOT NULL CONSTRAINT DF_Promo_boolean DEFAULT 0,
    updatedAt DATETIME2 NOT NULL CONSTRAINT DF_Promo_updatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Promo_singleton CHECK (id = 1)
  );

  INSERT INTO dbo.Promo (id, text, [boolean], updatedAt)
  VALUES (1, N'', 0, SYSUTCDATETIME());
END
