import { getPool } from "../config/database";
import { logger } from "../utils/logger";

export async function ensureSearchInformationSchema(): Promise<void> {
  const pool = await getPool();

  const tableResult = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.SearchInformation', N'U') AS tableId
  `);

  if (tableResult.recordset[0]?.tableId) {
    return;
  }

  await pool.request().query(`
    CREATE TABLE dbo.SearchInformation (
      id INT NOT NULL CONSTRAINT PK_SearchInformation PRIMARY KEY DEFAULT 1,
      titleAr NVARCHAR(512) NOT NULL CONSTRAINT DF_SearchInformation_titleAr DEFAULT N'',
      titleEn NVARCHAR(512) NOT NULL CONSTRAINT DF_SearchInformation_titleEn DEFAULT N'',
      descriptionAr NVARCHAR(MAX) NOT NULL CONSTRAINT DF_SearchInformation_descriptionAr DEFAULT N'',
      descriptionEn NVARCHAR(MAX) NOT NULL CONSTRAINT DF_SearchInformation_descriptionEn DEFAULT N'',
      updatedAt DATETIME2 NOT NULL CONSTRAINT DF_SearchInformation_updatedAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_SearchInformation_singleton CHECK (id = 1)
    );
  `);

  await pool.request().query(`
    INSERT INTO dbo.SearchInformation (
      id,
      titleAr,
      titleEn,
      descriptionAr,
      descriptionEn,
      updatedAt
    )
    VALUES (1, N'', N'', N'', N'', SYSUTCDATETIME());
  `);

  logger.info("SearchInformation table created");
}
