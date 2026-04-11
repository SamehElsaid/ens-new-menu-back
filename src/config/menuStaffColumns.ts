import { getPool } from "./database";

export function quoteMenuStaffIdent(name: string): string {
  return `[${String(name).replace(/]/g, "]]")}]`;
}

function quoteIdent(name: string): string {
  return quoteMenuStaffIdent(name);
}

export type MenuStaffColumnMeta = {
  /** Actual DB column name for display name (unquoted) */
  nameKey: string;
  emailKey: string | null;
  passwordKey: string | null;
  /** Actual DB column for active flag (unquoted) */
  activeKey: string | null;
  activeColumnQuoted: string | null;
  roleKey: string | null;
  roleColumnQuoted: string | null;
  phoneKey: string | null;
  phoneColumnQuoted: string | null;
  createdAtKey: string | null;
};

let cached: MenuStaffColumnMeta | null = null;

export async function getMenuStaffColumnMeta(): Promise<MenuStaffColumnMeta> {
  if (cached) return cached;

  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'MenuStaff'
  `);
  const names = (r.recordset as { COLUMN_NAME: string }[]).map(
    (row) => row.COLUMN_NAME,
  );

  const pick = (...candidates: string[]): string | null => {
    for (const c of candidates) {
      const found = names.find((n) => n.toLowerCase() === c.toLowerCase());
      if (found) return found;
    }
    return null;
  };

  const nameKey =
    pick("name", "fullName", "staffName", "displayName") ?? "name";
  const emailKey = pick("email", "emailAddress");
  const passwordKey = pick(
    "password",
    "passwordHash",
    "hashedPassword",
    "userPassword",
    "pwd",
  );
  const activeName = pick("isActive", "active", "available", "isAvailable");
  const roleName = pick("role", "staffRole");
  const phoneName = pick("phone", "phoneNumber", "mobile", "tel");
  const createdAtKey = pick("createdAt", "CreatedAt", "created_at");

  cached = {
    nameKey,
    emailKey,
    passwordKey,
    activeKey: activeName,
    activeColumnQuoted: activeName ? quoteIdent(activeName) : null,
    roleKey: roleName,
    roleColumnQuoted: roleName ? quoteIdent(roleName) : null,
    phoneKey: phoneName,
    phoneColumnQuoted: phoneName ? quoteIdent(phoneName) : null,
    createdAtKey,
  };
  return cached;
}

export function resetMenuStaffColumnMetaCache(): void {
  cached = null;
}

/** Password hash value from a MenuStaff row (column name varies by DB). */
export function getStaffPasswordHash(
  row: Record<string, unknown>,
  meta: MenuStaffColumnMeta,
): string | null {
  if (!meta.passwordKey) return null;
  const v = row[meta.passwordKey];
  if (v == null) return null;
  return String(v);
}

/** Active flag from row using resolved column name. */
export function getStaffIsActive(
  row: Record<string, unknown>,
  meta: MenuStaffColumnMeta,
): boolean {
  if (!meta.activeKey) return true;
  const key = Object.keys(row).find(
    (k) => k.toLowerCase() === meta.activeKey!.toLowerCase(),
  );
  if (!key) return true;
  const v = row[key];
  return v === true || v === 1 || v === "1";
}

/** Map DB row to stable API shape (isActive, name, role, phone, email, …). */
export function normalizeStaffRow(
  row: Record<string, unknown>,
  meta: MenuStaffColumnMeta,
): Record<string, unknown> {
  const pick = (key: string | null | undefined) => {
    if (!key) return null;
    const k = Object.keys(row).find(
      (n) => n.toLowerCase() === key.toLowerCase(),
    );
    return k != null ? row[k] : null;
  };

  return {
    id: row.id,
    menuId: row.menuId,
    name: pick(meta.nameKey),
    role: meta.roleKey ? pick(meta.roleKey) : null,
    phone: meta.phoneKey ? pick(meta.phoneKey) : null,
    email: meta.emailKey ? pick(meta.emailKey) : null,
    isActive: getStaffIsActive(row, meta),
    createdAt: meta.createdAtKey ? pick(meta.createdAtKey) : undefined,
  };
}
