import { getPool, sql } from "../config/database";
import { ensureMenuGroupSchema } from "../schemas/menuGroup.schema";
import { isUserOnFreePlan } from "./subscriptionPlan.service";

export type MenuGroupRecord = {
  id: number;
  userId: number;
  name: string;
  inboxMenuId: number | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type MenuGroupWithMenus = MenuGroupRecord & {
  menuIds: number[];
};

export type ValidateMenuGroupMenusResult =
  | { ok: true; menuIds: number[] }
  | {
      ok: false;
      code:
        | "PRO_REQUIRED"
        | "MENUS_REQUIRED"
        | "MENU_NOT_FOUND"
        | "MENU_IN_OTHER_GROUP";
    };

function sanitizeMenuIds(ids: number[]): number[] {
  return [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
}

/** Safe `IN (1,2,3)` fragment — ids are validated integers only. */
export function buildSqlIntInList(ids: number[]): string | null {
  const safe = sanitizeMenuIds(ids);
  if (safe.length === 0) return null;
  return safe.join(",");
}

export async function getMenuGroupIdForMenu(
  menuId: number,
): Promise<number | null> {
  await ensureMenuGroupSchema();
  const pool = await getPool();
  const r = await pool.request().input("menuId", sql.Int, menuId).query(`
    SELECT menuGroupId FROM Menus WHERE id = @menuId
  `);
  const groupId = r.recordset[0]?.menuGroupId;
  if (groupId == null) return null;
  const n = Number(groupId);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function getMenuGroupRecord(
  groupId: number,
): Promise<MenuGroupRecord | null> {
  await ensureMenuGroupSchema();
  const pool = await getPool();
  const r = await pool.request().input("groupId", sql.Int, groupId).query(`
    SELECT id, userId, name, inboxMenuId, createdAt, updatedAt
    FROM MenuGroups
    WHERE id = @groupId
  `);
  const row = r.recordset[0] as MenuGroupRecord | undefined;
  return row ?? null;
}

/** Menu that receives shared delivery orders for the group. */
export async function resolveInboxMenuId(menuId: number): Promise<number> {
  const groupId = await getMenuGroupIdForMenu(menuId);
  if (groupId == null) return menuId;

  const group = await getMenuGroupRecord(groupId);
  if (!group) return menuId;

  const inbox = group.inboxMenuId;
  if (inbox != null && Number.isFinite(inbox) && inbox > 0) {
    return inbox;
  }

  const pool = await getPool();
  const r = await pool.request().input("groupId", sql.Int, groupId).query(`
    SELECT MIN(id) AS minId FROM Menus WHERE menuGroupId = @groupId
  `);
  const minId = Number(r.recordset[0]?.minId);
  return Number.isFinite(minId) && minId > 0 ? minId : menuId;
}

/** All menu ids in the same named group (or solo menu). */
export async function getDeliveryGroupMenuIds(menuId: number): Promise<number[]> {
  const groupId = await getMenuGroupIdForMenu(menuId);
  if (groupId == null) return [menuId];

  await ensureMenuGroupSchema();
  const pool = await getPool();
  const r = await pool.request().input("groupId", sql.Int, groupId).query(`
    SELECT id FROM Menus WHERE menuGroupId = @groupId
  `);
  const ids = (r.recordset as { id: number }[]).map((row) => row.id);
  return sanitizeMenuIds(ids.length > 0 ? ids : [menuId]);
}

export async function validateMenuGroupMenus(
  userId: number,
  menuIdsRaw: number[],
  excludeGroupId?: number | null,
): Promise<ValidateMenuGroupMenusResult> {
  if (await isUserOnFreePlan(userId)) {
    return { ok: false, code: "PRO_REQUIRED" };
  }

  const menuIds = sanitizeMenuIds(menuIdsRaw);
  if (menuIds.length < 2) {
    return { ok: false, code: "MENUS_REQUIRED" };
  }

  await ensureMenuGroupSchema();
  const pool = await getPool();
  const inList = buildSqlIntInList(menuIds);
  if (!inList) {
    return { ok: false, code: "MENUS_REQUIRED" };
  }

  const owned = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT id, menuGroupId
    FROM Menus
    WHERE userId = @userId AND id IN (${inList})
  `);

  if (owned.recordset.length !== menuIds.length) {
    return { ok: false, code: "MENU_NOT_FOUND" };
  }

  for (const row of owned.recordset as {
    id: number;
    menuGroupId: number | null;
  }[]) {
    const existingGroupId =
      row.menuGroupId != null ? Number(row.menuGroupId) : null;
    if (
      existingGroupId != null &&
      existingGroupId > 0 &&
      existingGroupId !== excludeGroupId
    ) {
      return { ok: false, code: "MENU_IN_OTHER_GROUP" };
    }
  }

  return { ok: true, menuIds };
}

export async function listUserMenuGroups(
  userId: number,
): Promise<MenuGroupWithMenus[]> {
  await ensureMenuGroupSchema();
  const pool = await getPool();

  const groups = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT id, userId, name, inboxMenuId, createdAt, updatedAt
    FROM MenuGroups
    WHERE userId = @userId
    ORDER BY createdAt DESC
  `);

  const result: MenuGroupWithMenus[] = [];
  for (const row of groups.recordset as MenuGroupRecord[]) {
    const menus = await pool.request().input("groupId", sql.Int, row.id).query(`
      SELECT id FROM Menus WHERE menuGroupId = @groupId ORDER BY id
    `);
    result.push({
      ...row,
      menuIds: (menus.recordset as { id: number }[]).map((m) => m.id),
    });
  }
  return result;
}

export type MenuGroupErrorCode =
  | "PRO_REQUIRED"
  | "MENUS_REQUIRED"
  | "MENU_NOT_FOUND"
  | "MENU_IN_OTHER_GROUP"
  | "NOT_FOUND";

export async function createMenuGroup(
  userId: number,
  name: string,
  menuIdsRaw: number[],
): Promise<
  | { ok: true; group: MenuGroupWithMenus }
  | { ok: false; code: MenuGroupErrorCode }
> {
  const trimmedName = name.trim().slice(0, 255);
  if (!trimmedName) {
    return { ok: false, code: "MENUS_REQUIRED" };
  }

  const validation = await validateMenuGroupMenus(userId, menuIdsRaw);
  if (!validation.ok) {
    return { ok: false, code: validation.code };
  }

  const menuIds = validation.menuIds;
  const inboxMenuId = Math.min(...menuIds);

  await ensureMenuGroupSchema();
  const pool = await getPool();

  const insert = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("name", sql.NVarChar, trimmedName)
    .input("inboxMenuId", sql.Int, inboxMenuId)
    .query(`
      INSERT INTO MenuGroups (userId, name, inboxMenuId)
      OUTPUT INSERTED.id, INSERTED.userId, INSERTED.name, INSERTED.inboxMenuId,
             INSERTED.createdAt, INSERTED.updatedAt
      VALUES (@userId, @name, @inboxMenuId)
    `);

  const group = insert.recordset[0] as MenuGroupRecord;

  for (const menuId of menuIds) {
    await pool
      .request()
      .input("groupId", sql.Int, group.id)
      .input("menuId", sql.Int, menuId)
      .input("userId", sql.Int, userId)
      .query(`
        UPDATE Menus
        SET menuGroupId = @groupId, primaryMenuId = NULL
        WHERE id = @menuId AND userId = @userId
      `);
  }

  return {
    ok: true,
    group: { ...group, menuIds },
  };
}

export async function updateMenuGroup(
  userId: number,
  groupId: number,
  input: { name?: string; menuIds?: number[] },
): Promise<
  | { ok: true; group: MenuGroupWithMenus }
  | { ok: false; code: MenuGroupErrorCode }
> {
  const existing = await getMenuGroupRecord(groupId);
  if (!existing || existing.userId !== userId) {
    return { ok: false, code: "NOT_FOUND" };
  }

  await ensureMenuGroupSchema();
  const pool = await getPool();

  if (input.name !== undefined) {
    const trimmedName = input.name.trim().slice(0, 255);
    if (!trimmedName) {
      return { ok: false, code: "MENUS_REQUIRED" };
    }
    await pool
      .request()
      .input("groupId", sql.Int, groupId)
      .input("name", sql.NVarChar, trimmedName)
      .query(`
        UPDATE MenuGroups SET name = @name, updatedAt = GETDATE() WHERE id = @groupId
      `);
  }

  if (input.menuIds !== undefined) {
    const validation = await validateMenuGroupMenus(
      userId,
      input.menuIds,
      groupId,
    );
    if (!validation.ok) {
      return { ok: false, code: validation.code };
    }

    const menuIds = validation.menuIds;
    const inboxMenuId =
      existing.inboxMenuId != null &&
      menuIds.includes(Number(existing.inboxMenuId))
        ? Number(existing.inboxMenuId)
        : Math.min(...menuIds);

    await pool
      .request()
      .input("groupId", sql.Int, groupId)
      .query(`
        UPDATE Menus SET menuGroupId = NULL WHERE menuGroupId = @groupId
      `);

    for (const menuId of menuIds) {
      await pool
        .request()
        .input("groupId", sql.Int, groupId)
        .input("menuId", sql.Int, menuId)
        .input("userId", sql.Int, userId)
        .query(`
          UPDATE Menus
          SET menuGroupId = @groupId, primaryMenuId = NULL
          WHERE id = @menuId AND userId = @userId
        `);
    }

    await pool
      .request()
      .input("groupId", sql.Int, groupId)
      .input("inboxMenuId", sql.Int, inboxMenuId)
      .query(`
        UPDATE MenuGroups
        SET inboxMenuId = @inboxMenuId, updatedAt = GETDATE()
        WHERE id = @groupId
      `);
  }

  const refreshed = await getMenuGroupRecord(groupId);
  if (!refreshed) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const menus = await pool.request().input("groupId", sql.Int, groupId).query(`
    SELECT id FROM Menus WHERE menuGroupId = @groupId ORDER BY id
  `);

  return {
    ok: true,
    group: {
      ...refreshed,
      menuIds: (menus.recordset as { id: number }[]).map((m) => m.id),
    },
  };
}

async function getMenuIdsInGroup(groupId: number): Promise<number[]> {
  await ensureMenuGroupSchema();
  const pool = await getPool();
  const r = await pool.request().input("groupId", sql.Int, groupId).query(`
    SELECT id FROM Menus WHERE menuGroupId = @groupId ORDER BY id
  `);
  return sanitizeMenuIds(
    (r.recordset as { id: number }[]).map((row) => row.id),
  );
}

/** Append one menu to an existing group (Pro). */
export async function addMenuToGroup(
  userId: number,
  groupId: number,
  menuId: number,
): Promise<
  | { ok: true; group: MenuGroupWithMenus }
  | { ok: false; code: MenuGroupErrorCode }
> {
  const existing = await getMenuGroupRecord(groupId);
  if (!existing || existing.userId !== userId) {
    return { ok: false, code: "NOT_FOUND" };
  }

  if (!Number.isFinite(menuId) || menuId <= 0) {
    return { ok: false, code: "MENU_NOT_FOUND" };
  }

  const currentIds = await getMenuIdsInGroup(groupId);
  if (currentIds.includes(menuId)) {
    return {
      ok: true,
      group: { ...existing, menuIds: currentIds },
    };
  }

  return updateMenuGroup(userId, groupId, {
    menuIds: [...currentIds, menuId],
  });
}

export async function deleteMenuGroup(
  userId: number,
  groupId: number,
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }> {
  const existing = await getMenuGroupRecord(groupId);
  if (!existing || existing.userId !== userId) {
    return { ok: false, code: "NOT_FOUND" };
  }

  await ensureMenuGroupSchema();
  const pool = await getPool();

  await pool.request().input("groupId", sql.Int, groupId).query(`
    UPDATE Menus SET menuGroupId = NULL WHERE menuGroupId = @groupId
  `);

  await pool.request().input("groupId", sql.Int, groupId).query(`
    DELETE FROM MenuGroups WHERE id = @groupId
  `);

  return { ok: true };
}

export async function fetchMenuDisplayNames(
  menuIds: number[],
): Promise<Map<number, { nameAr: string; nameEn: string }>> {
  const ids = sanitizeMenuIds(menuIds);
  const map = new Map<number, { nameAr: string; nameEn: string }>();
  if (ids.length === 0) return map;

  const inList = buildSqlIntInList(ids);
  if (!inList) return map;

  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT
      m.id,
      mtAr.name AS nameAr,
      mtEn.name AS nameEn
    FROM Menus m
    LEFT JOIN MenuTranslations mtAr ON m.id = mtAr.menuId AND mtAr.locale = N'ar'
    LEFT JOIN MenuTranslations mtEn ON m.id = mtEn.menuId AND mtEn.locale = N'en'
    WHERE m.id IN (${inList})
  `);

  for (const row of r.recordset as {
    id: number;
    nameAr?: string | null;
    nameEn?: string | null;
  }[]) {
    map.set(row.id, {
      nameAr: row.nameAr?.trim() || row.nameEn?.trim() || `#${row.id}`,
      nameEn: row.nameEn?.trim() || row.nameAr?.trim() || `#${row.id}`,
    });
  }
  return map;
}
