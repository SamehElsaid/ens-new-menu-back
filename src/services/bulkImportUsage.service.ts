import type sql from "mssql";

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

export async function canUserBulkImport(_userId: number): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  return { allowed: true, used: 0, limit: -1 };
}

/** No-op — AI menu import is free for all users. */
export async function assertAndRecordBulkImportUsage(
  _transaction: sql.Transaction,
  _userId: number,
  _menuId: number,
): Promise<void> {
  return;
}
