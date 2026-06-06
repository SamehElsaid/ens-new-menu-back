import type sql from "mssql";
import { getPool, sql as mssql } from "../config/database";
import { FREE_BULK_IMPORT_MAX } from "../config/constants";
import { logger } from "../utils/logger";
import { isUserOnFreePlan } from "./subscriptionPlan.service";

export class BulkImportLimitError extends Error {
  readonly used: number;
  readonly limit: number;

  constructor(used: number, limit: number) {
    super("BULK_IMPORT_LIMIT");
    this.name = "BulkImportLimitError";
    this.used = used;
    this.limit = limit;
  }
}

export async function ensureBulkImportUsageSchema(): Promise<void> {
  const pool = await getPool();
  const tableResult = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.MenuBulkImportUsage', N'U') AS tableId
  `);

  if (tableResult.recordset[0]?.tableId) {
    return;
  }

  await pool.request().query(`
    CREATE TABLE dbo.MenuBulkImportUsage (
      id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MenuBulkImportUsage PRIMARY KEY,
      userId INT NOT NULL,
      menuId INT NOT NULL,
      createdAt DATETIME2 NOT NULL CONSTRAINT DF_MenuBulkImportUsage_createdAt DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_MenuBulkImportUsage_userId ON dbo.MenuBulkImportUsage (userId);
  `);

  logger.info("MenuBulkImportUsage table created");
}

export async function getBulkImportUsageCount(userId: number): Promise<number> {
  await ensureBulkImportUsageSchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", mssql.Int, userId)
    .query(`
      SELECT COUNT(*) AS count
      FROM dbo.MenuBulkImportUsage
      WHERE userId = @userId
    `);

  return Number(result.recordset[0]?.count ?? 0);
}

export async function canUserBulkImport(userId: number): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  if (!(await isUserOnFreePlan(userId))) {
    return { allowed: true, used: 0, limit: -1 };
  }

  const used = await getBulkImportUsageCount(userId);
  return {
    allowed: used < FREE_BULK_IMPORT_MAX,
    used,
    limit: FREE_BULK_IMPORT_MAX,
  };
}

/** Reserve one bulk-import slot for free users inside an open transaction. */
export async function assertAndRecordBulkImportUsage(
  transaction: sql.Transaction,
  userId: number,
  menuId: number,
): Promise<void> {
  await ensureBulkImportUsageSchema();

  if (!(await isUserOnFreePlan(userId))) {
    return;
  }

  const countResult = await transaction
    .request()
    .input("userId", mssql.Int, userId)
    .query(`
      SELECT COUNT(*) AS count
      FROM dbo.MenuBulkImportUsage WITH (UPDLOCK, HOLDLOCK)
      WHERE userId = @userId
    `);

  const used = Number(countResult.recordset[0]?.count ?? 0);
  if (used >= FREE_BULK_IMPORT_MAX) {
    throw new BulkImportLimitError(used, FREE_BULK_IMPORT_MAX);
  }

  await transaction
    .request()
    .input("userId", mssql.Int, userId)
    .input("menuId", mssql.Int, menuId)
    .query(`
      INSERT INTO dbo.MenuBulkImportUsage (userId, menuId)
      VALUES (@userId, @menuId)
    `);
}
