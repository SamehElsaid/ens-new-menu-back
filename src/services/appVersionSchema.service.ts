import { getPool } from "../config/database";
import { logger } from "../utils/logger";

async function dropSingletonConstraintIfExists(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.check_constraints
      WHERE name = N'CK_AppVersion_singleton'
        AND parent_object_id = OBJECT_ID(N'dbo.AppVersion')
    )
    BEGIN
      ALTER TABLE dbo.AppVersion DROP CONSTRAINT CK_AppVersion_singleton;
    END
  `);
}

async function migrateToIdentityTable(): Promise<void> {
  const pool = await getPool();

  await dropSingletonConstraintIfExists();

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.AppVersion_new', N'U') IS NOT NULL
      DROP TABLE dbo.AppVersion_new;
  `);

  await pool.request().query(`
    CREATE TABLE dbo.AppVersion_new (
      id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_AppVersion_new PRIMARY KEY,
      latestVersion NVARCHAR(32) NOT NULL,
      forceUpdate BIT NOT NULL CONSTRAINT DF_AppVersion_new_forceUpdate DEFAULT 0,
      downloadUrl NVARCHAR(2048) NOT NULL,
      releaseNotes_ar NVARCHAR(MAX) NULL,
      releaseNotes_en NVARCHAR(MAX) NULL,
      updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppVersion_new_updatedAt DEFAULT SYSUTCDATETIME()
    );
  `);

  await pool.request().query(`
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
  `);

  await pool.request().query(`DROP TABLE dbo.AppVersion;`);
  await pool.request().query(`EXEC sp_rename N'dbo.AppVersion_new', N'AppVersion';`);
  await pool.request().query(
    `EXEC sp_rename N'PK_AppVersion_new', N'PK_AppVersion', N'OBJECT';`,
  );
}

/**
 * Ensures AppVersion supports multiple rows (IDENTITY id).
 * Migrates legacy singleton table (id = 1) automatically.
 */
export async function ensureAppVersionSchema(): Promise<void> {
  const pool = await getPool();

  const tableResult = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.AppVersion', N'U') AS tableId
  `);

  if (!tableResult.recordset[0]?.tableId) {
    await pool.request().query(`
      CREATE TABLE dbo.AppVersion (
        id INT IDENTITY(1, 1) NOT NULL CONSTRAINT PK_AppVersion PRIMARY KEY,
        latestVersion NVARCHAR(32) NOT NULL,
        forceUpdate BIT NOT NULL CONSTRAINT DF_AppVersion_forceUpdate DEFAULT 0,
        downloadUrl NVARCHAR(2048) NOT NULL,
        releaseNotes_ar NVARCHAR(MAX) NULL,
        releaseNotes_en NVARCHAR(MAX) NULL,
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppVersion_updatedAt DEFAULT SYSUTCDATETIME()
      );
    `);
    logger.info("AppVersion table created (multi-row schema)");
    return;
  }

  const identityResult = await pool.request().query(`
    SELECT c.is_identity AS isIdentity
    FROM sys.columns c
    INNER JOIN sys.tables t ON c.object_id = t.object_id
    WHERE t.name = N'AppVersion' AND c.name = N'id'
  `);

  const isIdentity = Boolean(identityResult.recordset[0]?.isIdentity);

  if (!isIdentity) {
    logger.info("Migrating AppVersion table to multi-row IDENTITY schema...");
    await migrateToIdentityTable();
    logger.info("AppVersion migration completed");
    return;
  }

  await dropSingletonConstraintIfExists();
}
