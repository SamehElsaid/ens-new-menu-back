import type sql from "mssql";
import { hasCapability } from "./planCapabilities.service";

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

export async function canUserBulkImport(userId: number): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const allowed = await hasCapability(userId, "aiMenuImport");
  if (!allowed) {
    return { allowed: false, used: 0, limit: 0 };
  }
  return { allowed: true, used: 0, limit: -1 };
}

/** Records usage only when the capability is enabled (unlimited uses while allowed). */
export async function assertAndRecordBulkImportUsage(
  _transaction: sql.Transaction,
  userId: number,
  _menuId: number,
): Promise<void> {
  const { allowed } = await canUserBulkImport(userId);
  if (!allowed) {
    throw new BulkImportLimitError(0, 0);
  }
}
