import { getPool, sql } from "../config/database";

const ALL_PERMISSION_KEYS = [
  "analytics",
  "users",
  "follow-ups",
  "plans",
  "payments",
  "advertisements",
  "promo",
  "app-version",
  "knowledge-management",
  "administrators",
] as const;

export type AdminPermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export function normalizePermissionKeys(
  permissions: unknown,
): AdminPermissionKey[] | null {
  if (permissions === null || permissions === undefined) return null;
  if (!Array.isArray(permissions)) return null;
  const valid = permissions.filter((k): k is AdminPermissionKey =>
    ALL_PERMISSION_KEYS.includes(k as AdminPermissionKey),
  );
  if (valid.length >= ALL_PERMISSION_KEYS.length) return null;
  return valid;
}

export async function saveAdminPermissions(
  adminUserId: number,
  permissions: AdminPermissionKey[] | null,
): Promise<void> {
  const pool = await getPool();
  const json =
    permissions === null ? null : JSON.stringify(permissions);

  await pool
    .request()
    .input("adminUserId", sql.Int, adminUserId)
    .input("permissionsJson", sql.NVarChar(sql.MAX), json)
    .query(`
      MERGE AdminPermissions AS target
      USING (SELECT @adminUserId AS adminUserId) AS source
      ON target.adminUserId = source.adminUserId
      WHEN MATCHED THEN
        UPDATE SET permissionsJson = @permissionsJson, updatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (adminUserId, permissionsJson) VALUES (@adminUserId, @permissionsJson);
    `);
}

export async function getAdminPermissions(
  adminUserId: number,
): Promise<AdminPermissionKey[] | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("adminUserId", sql.Int, adminUserId)
    .query(`
      SELECT permissionsJson FROM AdminPermissions WHERE adminUserId = @adminUserId
    `);

  if (!result.recordset.length) return null;
  const raw = result.recordset[0].permissionsJson;
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return normalizePermissionKeys(parsed);
  } catch {
    return null;
  }
}

export async function getAdminPermissionsMap(
  adminUserIds: number[],
): Promise<Record<number, AdminPermissionKey[] | null>> {
  if (!adminUserIds.length) return {};
  const pool = await getPool();
  const ids = adminUserIds.join(",");
  const result = await pool.request().query(`
    SELECT adminUserId, permissionsJson
    FROM AdminPermissions
    WHERE adminUserId IN (${ids})
  `);

  const map: Record<number, AdminPermissionKey[] | null> = {};
  for (const row of result.recordset) {
    const id = row.adminUserId as number;
    const raw = row.permissionsJson;
    if (raw == null) {
      map[id] = null;
      continue;
    }
    try {
      map[id] = normalizePermissionKeys(JSON.parse(String(raw)));
    } catch {
      map[id] = null;
    }
  }
  return map;
}
