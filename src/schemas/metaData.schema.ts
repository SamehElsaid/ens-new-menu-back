import { getPool } from "../config/database";
import { logger } from "../utils/logger";

export async function ensureMetaDataSchema(): Promise<void> {
  const pool = await getPool();

  const tableResult = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.MetaData', N'U') AS tableId
  `);

  if (tableResult.recordset[0]?.tableId) {
    await migrateExistingTable(pool);
    return;
  }

  await pool.request().query(`
    CREATE TABLE dbo.MetaData (
      id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MetaData PRIMARY KEY,
      pageName      NVARCHAR(128)     NOT NULL CONSTRAINT UQ_MetaData_pageName UNIQUE,
      titleAr       NVARCHAR(512)     NOT NULL CONSTRAINT DF_MetaData_titleAr       DEFAULT N'',
      titleEn       NVARCHAR(512)     NOT NULL CONSTRAINT DF_MetaData_titleEn       DEFAULT N'',
      descriptionAr NVARCHAR(MAX)     NOT NULL CONSTRAINT DF_MetaData_descriptionAr DEFAULT N'',
      descriptionEn NVARCHAR(MAX)     NOT NULL CONSTRAINT DF_MetaData_descriptionEn DEFAULT N'',
      keywordsAr    NVARCHAR(MAX)     NOT NULL CONSTRAINT DF_MetaData_keywordsAr    DEFAULT N'',
      keywordsEn    NVARCHAR(MAX)     NOT NULL CONSTRAINT DF_MetaData_keywordsEn    DEFAULT N'',
      updatedAt     DATETIME2         NOT NULL CONSTRAINT DF_MetaData_updatedAt     DEFAULT SYSUTCDATETIME(),
      createdAt     DATETIME2         NOT NULL CONSTRAINT DF_MetaData_createdAt     DEFAULT SYSUTCDATETIME()
    );
  `);

  logger.info("MetaData table created");
}

async function migrateExistingTable(
  pool: Awaited<ReturnType<typeof getPool>>,
): Promise<void> {
  await pool.request().query(`
    IF COL_LENGTH(N'dbo.MetaData', N'pageName') IS NULL
    BEGIN
      ALTER TABLE dbo.MetaData ADD pageName NVARCHAR(128) NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'UQ_MetaData_pageName'
        AND object_id = OBJECT_ID(N'dbo.MetaData')
    )
    BEGIN
      CREATE UNIQUE INDEX UQ_MetaData_pageName ON dbo.MetaData(pageName)
      WHERE pageName IS NOT NULL;
    END
  `);
}
