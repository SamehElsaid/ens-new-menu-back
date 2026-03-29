import { getPool } from "./database";

/** Quoted identifier for T-SQL (handles reserved words like "active") */
function quoteIdent(name: string): string {
  return `[${String(name).replace(/]/g, "]]")}]`;
}

export type MenuTablesColumnMeta = {
  /** Bracket-quoted column for "table is active" flag, or null if table has no such column */
  activeColumnQuoted: string | null;
  /** Bracket-quoted seats/capacity column, or null if absent */
  seatsColumnQuoted: string | null;
};

let cached: MenuTablesColumnMeta | null = null;

/**
 * MenuTables schema varies by deployment; resolve active-flag column once per process.
 */
export async function getMenuTablesColumnMeta(): Promise<MenuTablesColumnMeta> {
  if (cached) return cached;

  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'MenuTables'
  `);
  const names = (r.recordset as { COLUMN_NAME: string }[]).map((row) => row.COLUMN_NAME);

  const pick = (...candidates: string[]): string | null => {
    for (const c of candidates) {
      const found = names.find((n) => n.toLowerCase() === c.toLowerCase());
      if (found) return found;
    }
    return null;
  };

  const activeName = pick("isActive", "active", "available", "isAvailable");
  const seatsName = pick("seats", "seatCount", "capacity", "chairCount", "numSeats");
  cached = {
    activeColumnQuoted: activeName ? quoteIdent(activeName) : null,
    seatsColumnQuoted: seatsName ? quoteIdent(seatsName) : null,
  };
  return cached;
}

export function resetMenuTablesColumnMetaCache(): void {
  cached = null;
}
