/**
 * Menu grants decide **which** menus a staff member may work on; their role
 * decides **what** they may do there. Owners never need grants — every menu
 * they own is implicitly accessible.
 */
import { getPool, sql } from "../config/database";
import { ROLES } from "../config/constants";

export interface AccessibleMenu {
  id: number;
  slug: string | null;
  uuid: string | null;
  logo: string | null;
  nameAr: string | null;
  nameEn: string | null;
  currency: string | null;
  isActive: boolean;
}

function toMenuIdList(rows: { menuId?: unknown; id?: unknown }[]): number[] {
  return rows
    .map((row) => Number(row.menuId ?? row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

/** Menu ids the owner account holds. */
export async function listOwnerMenuIds(ownerUserId: number): Promise<number[]> {
  if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) return [];
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, ownerUserId)
    .query(`SELECT id FROM dbo.Menus WHERE userId = @userId ORDER BY id ASC`);
  return toMenuIdList(result.recordset as { id: unknown }[]);
}

/** Menu ids granted to a staff member. */
export async function listStaffGrantedMenuIds(
  staffId: number,
): Promise<number[]> {
  if (!Number.isFinite(staffId) || staffId <= 0) return [];
  const pool = await getPool();
  const result = await pool
    .request()
    .input("staffId", sql.Int, staffId)
    .query(`
      SELECT g.menuId
      FROM dbo.MenuStaffGrants g
      INNER JOIN dbo.Menus m ON m.id = g.menuId
      WHERE g.staffId = @staffId
      ORDER BY g.menuId ASC
    `);
  return toMenuIdList(result.recordset as { menuId: unknown }[]);
}

export async function staffHasMenuGrant(
  staffId: number,
  menuId: number,
): Promise<boolean> {
  if (!Number.isFinite(staffId) || staffId <= 0) return false;
  if (!Number.isFinite(menuId) || menuId <= 0) return false;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("staffId", sql.Int, staffId)
    .input("menuId", sql.Int, menuId)
    .query(`
      SELECT TOP 1 1 AS ok
      FROM dbo.MenuStaffGrants
      WHERE staffId = @staffId AND menuId = @menuId
    `);
  return result.recordset.length > 0;
}

/** Owner account that a staff member belongs to. */
export async function getStaffOwnerUserId(
  staffId: number,
): Promise<number | null> {
  if (!Number.isFinite(staffId) || staffId <= 0) return null;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("staffId", sql.Int, staffId)
    .query(`
      SELECT TOP 1 COALESCE(s.ownerUserId, m.userId) AS ownerUserId
      FROM dbo.MenuStaff s
      LEFT JOIN dbo.Menus m ON m.id = s.menuId
      WHERE s.id = @staffId
    `);
  const value = result.recordset[0]?.ownerUserId;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

/**
 * Resolves the owner account behind any actor: owners are themselves, staff
 * inherit the account they were created under.
 */
export async function resolveOwnerUserId(auth: {
  userId: number;
  role: string;
}): Promise<number | null> {
  if (auth.role !== ROLES.STAFF) return auth.userId;
  return getStaffOwnerUserId(auth.userId);
}

/** Every menu id the actor may read: all owned menus, or the granted subset. */
export async function listAccessibleMenuIds(auth: {
  userId: number;
  role: string;
}): Promise<number[]> {
  if (auth.role !== ROLES.STAFF) return listOwnerMenuIds(auth.userId);
  return listStaffGrantedMenuIds(auth.userId);
}

/** Same as `listAccessibleMenuIds`, with the display fields the dashboard needs. */
export async function listAccessibleMenus(auth: {
  userId: number;
  role: string;
}): Promise<AccessibleMenu[]> {
  const isStaff = auth.role === ROLES.STAFF;
  const pool = await getPool();
  const request = pool.request().input("userId", sql.Int, auth.userId);

  const scope = isStaff
    ? `INNER JOIN dbo.MenuStaffGrants g ON g.menuId = m.id AND g.staffId = @userId`
    : ``;
  const filter = isStaff ? `` : `WHERE m.userId = @userId`;

  const result = await request.query(`
    SELECT
      m.id,
      m.slug,
      m.uuid,
      m.logo,
      m.isActive,
      ISNULL(m.currency, 'SAR') AS currency,
      ar.name AS nameAr,
      en.name AS nameEn
    FROM dbo.Menus m
    ${scope}
    LEFT JOIN dbo.MenuTranslations ar ON ar.menuId = m.id AND ar.locale = 'ar'
    LEFT JOIN dbo.MenuTranslations en ON en.menuId = m.id AND en.locale = 'en'
    ${filter}
    ORDER BY m.id ASC
  `);

  return (result.recordset as Record<string, unknown>[]).map((row) => ({
    id: Number(row.id),
    slug: row.slug != null ? String(row.slug) : null,
    uuid: row.uuid != null ? String(row.uuid) : null,
    logo: row.logo != null ? String(row.logo) : null,
    nameAr: row.nameAr != null ? String(row.nameAr) : null,
    nameEn: row.nameEn != null ? String(row.nameEn) : null,
    currency: row.currency != null ? String(row.currency) : null,
    isActive: Boolean(row.isActive),
  }));
}

/** Keeps only the ids that actually belong to the owner account. */
export async function filterMenuIdsOwnedBy(
  ownerUserId: number,
  menuIds: number[],
): Promise<number[]> {
  const wanted = [...new Set(menuIds)].filter(
    (id) => Number.isFinite(id) && id > 0,
  );
  if (wanted.length === 0) return [];

  const pool = await getPool();
  const request = pool.request().input("userId", sql.Int, ownerUserId);
  const params = wanted.map((id, index) => {
    request.input(`menu${index}`, sql.Int, id);
    return `@menu${index}`;
  });

  const result = await request.query(`
    SELECT id FROM dbo.Menus
    WHERE userId = @userId AND id IN (${params.join(", ")})
  `);
  return toMenuIdList(result.recordset as { id: unknown }[]);
}

/**
 * Replaces a staff member's grants with `menuIds` (already validated against
 * the owner). Returns the grants actually stored.
 */
export async function setStaffMenuGrants(
  staffId: number,
  menuIds: number[],
): Promise<number[]> {
  const pool = await getPool();
  const wanted = [...new Set(menuIds)].filter(
    (id) => Number.isFinite(id) && id > 0,
  );

  if (wanted.length === 0) {
    await pool
      .request()
      .input("staffId", sql.Int, staffId)
      .query(`DELETE FROM dbo.MenuStaffGrants WHERE staffId = @staffId`);
    return [];
  }

  const deleteRequest = pool.request().input("staffId", sql.Int, staffId);
  const keepParams = wanted.map((id, index) => {
    deleteRequest.input(`keep${index}`, sql.Int, id);
    return `@keep${index}`;
  });
  await deleteRequest.query(`
    DELETE FROM dbo.MenuStaffGrants
    WHERE staffId = @staffId AND menuId NOT IN (${keepParams.join(", ")})
  `);

  for (const menuId of wanted) {
    await pool
      .request()
      .input("staffId", sql.Int, staffId)
      .input("menuId", sql.Int, menuId)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.MenuStaffGrants
          WHERE staffId = @staffId AND menuId = @menuId
        )
        BEGIN
          INSERT INTO dbo.MenuStaffGrants (staffId, menuId)
          VALUES (@staffId, @menuId);
        END
      `);
  }

  return listStaffGrantedMenuIds(staffId);
}

/** Grants for many staff at once — avoids N queries when listing staff. */
export async function listGrantsForStaffIds(
  staffIds: number[],
): Promise<Map<number, number[]>> {
  const ids = [...new Set(staffIds)].filter(
    (id) => Number.isFinite(id) && id > 0,
  );
  const grouped = new Map<number, number[]>();
  if (ids.length === 0) return grouped;

  const pool = await getPool();
  const request = pool.request();
  const params = ids.map((id, index) => {
    request.input(`staff${index}`, sql.Int, id);
    return `@staff${index}`;
  });

  const result = await request.query(`
    SELECT g.staffId, g.menuId
    FROM dbo.MenuStaffGrants g
    INNER JOIN dbo.Menus m ON m.id = g.menuId
    WHERE g.staffId IN (${params.join(", ")})
    ORDER BY g.menuId ASC
  `);

  for (const row of result.recordset as {
    staffId: number;
    menuId: number;
  }[]) {
    const staffId = Number(row.staffId);
    const menuId = Number(row.menuId);
    if (!Number.isFinite(staffId) || !Number.isFinite(menuId)) continue;
    const current = grouped.get(staffId);
    if (current) current.push(menuId);
    else grouped.set(staffId, [menuId]);
  }

  return grouped;
}
