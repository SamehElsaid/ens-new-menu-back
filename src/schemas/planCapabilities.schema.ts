import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import {
  CUSTOM_DISPLAY_CAPABILITIES_DEFAULT,
  FREE_PLAN_CAPABILITIES_DEFAULT,
  PRO_PLAN_CAPABILITIES_DEFAULT,
  type PlanCapabilities,
} from "../types/planCapabilities";

function jsonCaps(caps: PlanCapabilities): string {
  return JSON.stringify(caps);
}

/** Idempotent Plans.capabilities column + PlanCustomDisplay row with current product defaults. */
export async function ensurePlanCapabilitiesSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH(N'dbo.Plans', N'capabilities') IS NULL
      ALTER TABLE dbo.Plans ADD capabilities NVARCHAR(MAX) NULL;
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.PlanCustomDisplay', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PlanCustomDisplay (
        id INT NOT NULL CONSTRAINT PK_PlanCustomDisplay PRIMARY KEY
          CONSTRAINT DF_PlanCustomDisplay_id DEFAULT 1,
        capabilities NVARCHAR(MAX) NOT NULL,
        updatedAt DATETIME2 NOT NULL
          CONSTRAINT DF_PlanCustomDisplay_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_PlanCustomDisplay_singleton CHECK (id = 1)
      );
    END
  `);

  const freeJson = jsonCaps(FREE_PLAN_CAPABILITIES_DEFAULT);
  const proJson = jsonCaps(PRO_PLAN_CAPABILITIES_DEFAULT);
  const customJson = jsonCaps(CUSTOM_DISPLAY_CAPABILITIES_DEFAULT);

  await pool
    .request()
    .input("freeCaps", sql.NVarChar(sql.MAX), freeJson)
    .query(`
      UPDATE Plans
      SET capabilities = @freeCaps
      WHERE LOWER(LTRIM(RTRIM(name))) = N'free'
        AND (capabilities IS NULL OR LTRIM(RTRIM(capabilities)) = N'');
    `);

  await pool
    .request()
    .input("proCaps", sql.NVarChar(sql.MAX), proJson)
    .query(`
      UPDATE Plans
      SET capabilities = @proCaps
      WHERE LOWER(LTRIM(RTRIM(name))) = N'pro'
        AND (capabilities IS NULL OR LTRIM(RTRIM(capabilities)) = N'');
    `);

  // Any other named plan without capabilities → Pro-like defaults (paid).
  await pool
    .request()
    .input("proCaps", sql.NVarChar(sql.MAX), proJson)
    .query(`
      UPDATE Plans
      SET capabilities = @proCaps
      WHERE LOWER(LTRIM(RTRIM(name))) NOT IN (N'free', N'pro')
        AND (capabilities IS NULL OR LTRIM(RTRIM(capabilities)) = N'');
    `);

  const customExists = await pool.request().query(`
    SELECT TOP 1 id FROM PlanCustomDisplay WHERE id = 1
  `);

  if (customExists.recordset.length === 0) {
    await pool
      .request()
      .input("caps", sql.NVarChar(sql.MAX), customJson)
      .query(`
        INSERT INTO PlanCustomDisplay (id, capabilities)
        VALUES (1, @caps);
      `);
  }

  logger.info("Plan capabilities schema ensured");
}
