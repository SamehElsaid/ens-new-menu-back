import { getPool } from "../config/database";
import { logger } from "../utils/logger";

export async function ensureHomepageFeaturedLogosSchema(): Promise<void> {
  const pool = await getPool();

  const tableResult = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.HomepageFeaturedLogos', N'U') AS tableId
  `);

  if (tableResult.recordset[0]?.tableId) {
    return;
  }

  await pool.request().query(`
    CREATE TABLE dbo.HomepageFeaturedLogos (
      id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HomepageFeaturedLogos PRIMARY KEY,
      menuId INT NOT NULL,
      userId INT NOT NULL,
      logo NVARCHAR(500) NOT NULL,
      countryCode NVARCHAR(2) NULL,
      sortOrder INT NOT NULL CONSTRAINT DF_HomepageFeaturedLogos_sortOrder DEFAULT 0,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_HomepageFeaturedLogos_createdAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_HomepageFeaturedLogos_menuId UNIQUE (menuId)
    );
  `);

  await pool.request().query(`
    CREATE INDEX IX_HomepageFeaturedLogos_sortOrder
      ON dbo.HomepageFeaturedLogos (sortOrder ASC, createdAt ASC);
  `);

  logger.info("HomepageFeaturedLogos table created");
}
