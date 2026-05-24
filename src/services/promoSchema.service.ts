import { getPool } from "../config/database";
import { logger } from "../utils/logger";

export async function ensurePromoSchema(): Promise<void> {
  const pool = await getPool();

  const tableResult = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.Promo', N'U') AS tableId
  `);

  if (tableResult.recordset[0]?.tableId) {
    return;
  }

  await pool.request().query(`
    CREATE TABLE dbo.Promo (
      id INT NOT NULL CONSTRAINT PK_Promo PRIMARY KEY DEFAULT 1,
      text NVARCHAR(MAX) NOT NULL CONSTRAINT DF_Promo_text DEFAULT N'',
      [boolean] BIT NOT NULL CONSTRAINT DF_Promo_boolean DEFAULT 0,
      updatedAt DATETIME2 NOT NULL CONSTRAINT DF_Promo_updatedAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_Promo_singleton CHECK (id = 1)
    );
  `);

  await pool.request().query(`
    INSERT INTO dbo.Promo (id, text, [boolean], updatedAt)
    VALUES (1, N'', 0, SYSUTCDATETIME());
  `);

  logger.info("Promo table created");
}
