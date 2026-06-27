import { getPool } from "../config/database";
import { resetMenuTablesColumnMetaCache } from "../config/menuTablesColumns";
import { logger } from "../utils/logger";

const NUMERIC_SQL_TYPES = new Set([
  "int",
  "bigint",
  "smallint",
  "tinyint",
  "decimal",
  "numeric",
]);

async function columnDataType(
  tableName: string,
  columnName: string,
): Promise<string | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("tableName", tableName)
    .input("columnName", columnName)
    .query(`
      SELECT DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
    `);
  const raw = result.recordset[0]?.DATA_TYPE;
  return typeof raw === "string" ? raw.toLowerCase() : null;
}

async function tableExists(tableName: string): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("tableName", tableName)
    .query(`
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = @tableName
    `);
  return result.recordset.length > 0;
}

type DroppedIndex = { name: string; isUnique: boolean; columnNames: string[] };

async function dropTableNumberDependencies(
  tableName: string,
  columnName: string,
): Promise<DroppedIndex[]> {
  const pool = await getPool();
  const droppedIndexes: DroppedIndex[] = [];

  const defaults = await pool.request().input("columnName", columnName).query(`
      SELECT dc.name AS constraintName
      FROM sys.default_constraints dc
      INNER JOIN sys.columns c
        ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      WHERE dc.parent_object_id = OBJECT_ID(N'dbo.${tableName}')
        AND c.name = @columnName
    `);

  for (const row of defaults.recordset as { constraintName: string }[]) {
    await pool.request().query(`
        ALTER TABLE dbo.[${tableName}] DROP CONSTRAINT [${row.constraintName}]
      `);
  }

  const checks = await pool.request().input("columnName", columnName).query(`
      SELECT cc.name AS constraintName
      FROM sys.check_constraints cc
      INNER JOIN sys.columns c
        ON cc.parent_object_id = c.object_id
      WHERE cc.parent_object_id = OBJECT_ID(N'dbo.${tableName}')
        AND c.name = @columnName
        AND cc.definition LIKE '%' + @columnName + '%'
    `);

  for (const row of checks.recordset as { constraintName: string }[]) {
    await pool.request().query(`
        ALTER TABLE dbo.[${tableName}] DROP CONSTRAINT [${row.constraintName}]
      `);
  }

  const indexes = await pool.request().input("columnName", columnName).query(`
      SELECT
        i.name AS indexName,
        i.is_unique AS isUnique,
        STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columnNames
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c
        ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE i.object_id = OBJECT_ID(N'dbo.${tableName}')
        AND i.is_primary_key = 0
        AND i.type > 0
        AND EXISTS (
          SELECT 1
          FROM sys.index_columns ic2
          INNER JOIN sys.columns c2
            ON ic2.object_id = c2.object_id AND ic2.column_id = c2.column_id
          WHERE ic2.object_id = i.object_id
            AND ic2.index_id = i.index_id
            AND c2.name = @columnName
        )
      GROUP BY i.name, i.is_unique
    `);

  for (const row of indexes.recordset as {
    indexName: string;
    isUnique: boolean;
    columnNames: string;
  }[]) {
    await pool.request().query(`
        DROP INDEX [${row.indexName}] ON dbo.[${tableName}]
      `);
    droppedIndexes.push({
      name: row.indexName,
      isUnique: Boolean(row.isUnique),
      columnNames: row.columnNames.split(","),
    });
  }

  return droppedIndexes;
}

async function recreateDroppedIndexes(
  tableName: string,
  droppedIndexes: DroppedIndex[],
): Promise<void> {
  const pool = await getPool();
  for (const index of droppedIndexes) {
    const cols = index.columnNames.map((c) => `[${c}]`).join(", ");
    const unique = index.isUnique ? "UNIQUE " : "";
    const indexName = index.name.replace(/[^\w]/g, "_");
    await pool.request().query(`
        CREATE ${unique}INDEX [${indexName}] ON dbo.[${tableName}] (${cols})
      `);
  }
}

async function widenTableNumberColumn(
  tableName: string,
  columnName: string,
): Promise<void> {
  const dataType = await columnDataType(tableName, columnName);
  if (!dataType) {
    logger.warn(
      `${tableName}.${columnName} column not found; skipped NVARCHAR migration`,
    );
    return;
  }

  if (!NUMERIC_SQL_TYPES.has(dataType)) {
    logger.debug(
      `${tableName}.${columnName} already ${dataType}; no migration needed`,
    );
    return;
  }

  const pool = await getPool();
  const droppedIndexes = await dropTableNumberDependencies(
    tableName,
    columnName,
  );

  try {
    await pool.request().query(`
      ALTER TABLE dbo.[${tableName}] ALTER COLUMN [${columnName}] NVARCHAR(50) NOT NULL;
    `);
    await recreateDroppedIndexes(tableName, droppedIndexes);
    logger.info(`${tableName}.${columnName} widened to NVARCHAR(50)`);
  } catch (error) {
    logger.error(
      `Failed to widen ${tableName}.${columnName} to NVARCHAR(50):`,
      error,
    );
    throw error;
  }
}

async function ensureIsActiveColumn(): Promise<void> {
  const pool = await getPool();
  const candidates = ["isActive", "active", "available", "isAvailable"] as const;

  for (const columnName of candidates) {
    const result = await pool.request().input("columnName", columnName).query(`
      SELECT DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'MenuTables' AND COLUMN_NAME = @columnName
    `);
    if (result.recordset.length > 0) {
      return;
    }
  }

  await pool.request().query(`
    IF COL_LENGTH('MenuTables', 'isActive') IS NULL
    BEGIN
      ALTER TABLE dbo.MenuTables
        ADD isActive BIT NOT NULL
        CONSTRAINT DF_MenuTables_isActive DEFAULT 1;
    END
  `);
  resetMenuTablesColumnMetaCache();
  logger.info("MenuTables.isActive column ensured");
}

/** Menu table labels must support alphanumeric values (e.g. A1, VIP-3). */
export async function ensureMenuTablesSchema(): Promise<void> {
  if (!(await tableExists("MenuTables"))) {
    return;
  }

  await ensureIsActiveColumn();
  await widenTableNumberColumn("MenuTables", "tableNumber");

  if (await tableExists("StaffTableCalls")) {
    const staffType = await columnDataType("StaffTableCalls", "tableNumber");
    if (staffType && NUMERIC_SQL_TYPES.has(staffType)) {
      const pool = await getPool();
      const droppedIndexes = await dropTableNumberDependencies(
        "StaffTableCalls",
        "tableNumber",
      );
      try {
        await pool.request().query(`
          ALTER TABLE dbo.StaffTableCalls ALTER COLUMN tableNumber NVARCHAR(50) NOT NULL;
        `);
        await recreateDroppedIndexes("StaffTableCalls", droppedIndexes);
        logger.info("StaffTableCalls.tableNumber widened to NVARCHAR(50)");
      } catch (error) {
        logger.error(
          "Failed to widen StaffTableCalls.tableNumber to NVARCHAR(50):",
          error,
        );
        throw error;
      }
    }
  }
}
