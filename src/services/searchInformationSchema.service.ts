import { getPool } from "../config/database";
import { logger } from "../utils/logger";

export async function ensureSearchInformationSchema(): Promise<void> {
  const pool = await getPool();

  const tableResult = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.SearchInformation', N'U') AS tableId
  `);

  if (tableResult.recordset[0]?.tableId) {
    await migrateExistingTable(pool);
    return;
  }

  await pool.request().query(`
    CREATE TABLE dbo.SearchInformation (
      id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SearchInformation PRIMARY KEY,
      titleAr    NVARCHAR(512)     NOT NULL CONSTRAINT DF_SearchInformation_titleAr    DEFAULT N'',
      titleEn    NVARCHAR(512)     NOT NULL CONSTRAINT DF_SearchInformation_titleEn    DEFAULT N'',
      descriptionAr NVARCHAR(MAX)  NOT NULL CONSTRAINT DF_SearchInformation_descriptionAr DEFAULT N'',
      descriptionEn NVARCHAR(MAX)  NOT NULL CONSTRAINT DF_SearchInformation_descriptionEn DEFAULT N'',
      updatedAt  DATETIME2         NOT NULL CONSTRAINT DF_SearchInformation_updatedAt  DEFAULT SYSUTCDATETIME(),
      createdAt  DATETIME2         NOT NULL CONSTRAINT DF_SearchInformation_createdAt  DEFAULT SYSUTCDATETIME()
    );
  `);

  logger.info("SearchInformation table created");
}

async function migrateExistingTable(
  pool: Awaited<ReturnType<typeof getPool>>,
): Promise<void> {
  const identityCheck = await pool.request().query(`
    SELECT is_identity
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.SearchInformation') AND name = 'id'
  `);

  const isIdentity = identityCheck.recordset[0]?.is_identity === true;

  if (!isIdentity) {
    logger.info("SearchInformation: migrating singleton table to multi-row...");

    await pool.request().query(`
      SELECT
        titleAr, titleEn, descriptionAr, descriptionEn,
        updatedAt,
        CASE WHEN createdAt IS NULL THEN updatedAt ELSE createdAt END AS createdAt
      INTO dbo.SearchInformation_migration_backup
      FROM dbo.SearchInformation;

      DROP TABLE dbo.SearchInformation;

      CREATE TABLE dbo.SearchInformation (
        id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SearchInformation PRIMARY KEY,
        titleAr    NVARCHAR(512)     NOT NULL CONSTRAINT DF_SearchInformation_titleAr    DEFAULT N'',
        titleEn    NVARCHAR(512)     NOT NULL CONSTRAINT DF_SearchInformation_titleEn    DEFAULT N'',
        descriptionAr NVARCHAR(MAX)  NOT NULL CONSTRAINT DF_SearchInformation_descriptionAr DEFAULT N'',
        descriptionEn NVARCHAR(MAX)  NOT NULL CONSTRAINT DF_SearchInformation_descriptionEn DEFAULT N'',
        updatedAt  DATETIME2         NOT NULL CONSTRAINT DF_SearchInformation_updatedAt  DEFAULT SYSUTCDATETIME(),
        createdAt  DATETIME2         NOT NULL CONSTRAINT DF_SearchInformation_createdAt  DEFAULT SYSUTCDATETIME()
      );

      INSERT INTO dbo.SearchInformation (titleAr, titleEn, descriptionAr, descriptionEn, updatedAt, createdAt)
      SELECT titleAr, titleEn, descriptionAr, descriptionEn, updatedAt, createdAt
      FROM dbo.SearchInformation_migration_backup
      WHERE titleAr <> N'' OR titleEn <> N''
         OR descriptionAr <> N'' OR descriptionEn <> N'';

      DROP TABLE dbo.SearchInformation_migration_backup;
    `);

    logger.info("SearchInformation: migration complete");
    return;
  }

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.SearchInformation') AND name = 'createdAt'
    )
    BEGIN
      ALTER TABLE dbo.SearchInformation
        ADD createdAt DATETIME2 NOT NULL
        CONSTRAINT DF_SearchInformation_createdAt DEFAULT SYSUTCDATETIME();
    END
  `);
}
