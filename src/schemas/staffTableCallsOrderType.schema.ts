import { getPool } from "../config/database";

/** Adds orderType, customerPhone, orderNotes on StaffTableCalls (idempotent). */
export async function ensureStaffTableCallsOrderTypeSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('StaffTableCalls', 'orderType') IS NULL
    BEGIN
      ALTER TABLE StaffTableCalls
        ADD orderType NVARCHAR(20) NOT NULL
        CONSTRAINT DF_StaffTableCalls_orderType DEFAULT N'table';
    END

    IF COL_LENGTH('StaffTableCalls', 'customerPhone') IS NULL
    BEGIN
      ALTER TABLE StaffTableCalls ADD customerPhone NVARCHAR(50) NULL;
    END

    IF COL_LENGTH('StaffTableCalls', 'orderNotes') IS NULL
    BEGIN
      ALTER TABLE StaffTableCalls ADD orderNotes NVARCHAR(500) NULL;
    END

    IF COL_LENGTH('StaffTableCalls', 'customerAddress') IS NULL
    BEGIN
      ALTER TABLE StaffTableCalls ADD customerAddress NVARCHAR(500) NULL;
    END
  `);

  await pool.request().query(`
    UPDATE StaffTableCalls
    SET orderType = N'delivery'
    WHERE LOWER(LTRIM(RTRIM(ISNULL(tableNumber, N'')))) = N'delivery'
      AND ISNULL(NULLIF(LTRIM(RTRIM(orderType)), N''), N'table') = N'table';
  `);
}
