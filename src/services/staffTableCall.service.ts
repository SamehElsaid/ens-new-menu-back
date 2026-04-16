/**
 * Persisted guest → staff table calls (StaffTableCalls).
 */

import { getPool, sql } from "../config/database";
import { getMenuTablesColumnMeta } from "../config/menuTablesColumns";
import {
  getMenuStaffColumnMeta,
  getStaffIsActive,
} from "../config/menuStaffColumns";
import { logger } from "../utils/logger";
import { isUserOnFreePlan } from "./subscriptionPlan.service";

export type GuestStaffCallError =
  | "INVALID_PAYLOAD"
  | "INVALID_ORDER_ITEMS"
  | "MENU_NOT_FOUND"
  | "INVALID_TABLE"
  | "FEATURE_REQUIRES_PRO"
  | "SERVER_ERROR";

/** One line in a guest-submitted order (id + unit price + qty from client, or legacy name-only). */
export type StaffOrderItem = {
  name: string;
  menuItemId?: number;
  /** Unit price at order time (required with `menuItemId` on create). */
  price?: number;
  quantity: number;
  notes?: string;
};

export type GuestStaffCallOptions = {
  customerName?: string | null;
  items?: unknown;
};

function parseCustomerName(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().slice(0, 200);
  return s.length ? s : null;
}

function parsePriceField(
  raw: unknown,
): { ok: true; value: number } | { ok: false } {
  if (raw == null || raw === "") {
    return { ok: false };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999.99) {
    return { ok: false };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function parseOrderItemsInput(raw: unknown):
  | { ok: true; items: StaffOrderItem[] }
  | { ok: false } {
  if (raw == null || raw === undefined) {
    return { ok: true, items: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false };
  }
  if (raw.length > 100) {
    return { ok: false };
  }
  const out: StaffOrderItem[] = [];
  for (const el of raw) {
    if (el == null || typeof el !== "object") {
      return { ok: false };
    }
    const o = el as Record<string, unknown>;
    const nameRaw = String(o.name ?? "").trim().slice(0, 500);

    let menuItemId: number | undefined;
    if (o.menuItemId != null && o.menuItemId !== "") {
      const n = Number(o.menuItemId);
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false };
      }
      menuItemId = Math.floor(n);
    }

    if (menuItemId !== undefined) {
      const priceParsed = parsePriceField(o.price);
      if (!priceParsed.ok) {
        return { ok: false };
      }
      if (o.quantity == null || o.quantity === "") {
        return { ok: false };
      }
      const q = Number(o.quantity);
      if (!Number.isFinite(q) || q < 1 || q > 999) {
        return { ok: false };
      }
      const quantity = Math.floor(q);
      let notes: string | undefined;
      if (o.notes != null && o.notes !== "") {
        notes = String(o.notes).trim().slice(0, 500);
      }
      out.push({
        name: nameRaw,
        menuItemId,
        price: priceParsed.value,
        quantity,
        ...(notes ? { notes } : {}),
      });
      continue;
    }

    if (!nameRaw) {
      return { ok: false };
    }
    let quantity = 1;
    if (o.quantity != null && o.quantity !== "") {
      const q = Number(o.quantity);
      if (!Number.isFinite(q) || q < 1 || q > 999) {
        return { ok: false };
      }
      quantity = Math.floor(q);
    }
    let notes: string | undefined;
    if (o.notes != null && o.notes !== "") {
      notes = String(o.notes).trim().slice(0, 500);
    }
    const optPrice = parsePriceField(o.price);
    out.push({
      name: nameRaw,
      quantity,
      ...(optPrice.ok ? { price: optPrice.value } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return { ok: true, items: out };
}

async function enrichMenuItemNames(
  menuId: number,
  items: StaffOrderItem[],
): Promise<StaffOrderItem[]> {
  const needIds = [
    ...new Set(
      items
        .filter((i) => i.menuItemId != null && !String(i.name ?? "").trim())
        .map((i) => i.menuItemId as number),
    ),
  ];
  if (needIds.length === 0) {
    return items;
  }

  const pool = await getPool();
  const req = pool.request().input("menuId", sql.Int, menuId);
  const parts: string[] = [];
  needIds.forEach((id, i) => {
    const p = `mid${i}`;
    parts.push(`@${p}`);
    req.input(p, sql.Int, id);
  });
  const r = await req.query(
    `SELECT mi.id,
      COALESCE(mitar.name, miten.name, N'#' + CAST(mi.id AS NVARCHAR(20))) AS displayName
     FROM MenuItems mi
     LEFT JOIN MenuItemTranslations mitar ON mitar.menuItemId = mi.id AND mitar.locale = N'ar'
     LEFT JOIN MenuItemTranslations miten ON miten.menuItemId = mi.id AND miten.locale = N'en'
     WHERE mi.menuId = @menuId AND mi.id IN (${parts.join(", ")})`,
  );
  const map = new Map<number, string>();
  for (const row of r.recordset as { id: number; displayName: string }[]) {
    const label = String(row.displayName ?? "").trim() || `Item ${row.id}`;
    map.set(row.id, label);
  }

  return items.map((it) => {
    const nm = String(it.name ?? "").trim();
    if (nm) {
      return it;
    }
    if (it.menuItemId != null) {
      const resolved = map.get(it.menuItemId) ?? `Item ${it.menuItemId}`;
      return { ...it, name: resolved };
    }
    return { ...it, name: "—" };
  });
}

async function menuItemsExistForMenu(
  menuId: number,
  itemIds: number[],
): Promise<boolean> {
  if (itemIds.length === 0) return true;
  const unique = [...new Set(itemIds)];
  const pool = await getPool();
  const req = pool.request().input("menuId", sql.Int, menuId);
  const parts: string[] = [];
  unique.forEach((id, i) => {
    const p = `mid${i}`;
    parts.push(`@${p}`);
    req.input(p, sql.Int, id);
  });
  const r = await req.query(
    `SELECT COUNT(*) AS c FROM MenuItems WHERE menuId = @menuId AND id IN (${parts.join(", ")})`,
  );
  return Number(r.recordset[0]?.c) === unique.length;
}

/**
 * Shared guest "call staff" logic (Socket.IO + HTTP).
 */
export async function processGuestStaffCall(
  menuId: number,
  tableNumber: string,
  options?: GuestStaffCallOptions,
): Promise<
  | {
      ok: true;
      id: number;
      menuId: number;
      tableNumber: string;
      createdAt: Date;
      customerName: string | null;
      items: StaffOrderItem[];
    }
  | { ok: false; error: GuestStaffCallError }
> {
  if (!Number.isFinite(menuId) || menuId <= 0) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  const safeTable = String(tableNumber ?? "")
    .trim()
    .slice(0, 50);
  if (!safeTable) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }

  const customerName = parseCustomerName(options?.customerName);
  const parsedItems = parseOrderItemsInput(options?.items);
  if (!parsedItems.ok) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  const items = parsedItems.items;
  const idsForCheck = items
    .map((i) => i.menuItemId)
    .filter((id): id is number => typeof id === "number");

  try {
    const pool = await getPool();

    if (idsForCheck.length > 0) {
      const okIds = await menuItemsExistForMenu(menuId, idsForCheck);
      if (!okIds) {
        return { ok: false, error: "INVALID_ORDER_ITEMS" };
      }
    }
    const menuCheck = await pool
      .request()
      .input("id", sql.Int, menuId)
      .query(`SELECT id, isActive, userId FROM Menus WHERE id = @id`);

    const m = menuCheck.recordset[0];
    if (!m || !m.isActive) {
      return { ok: false, error: "MENU_NOT_FOUND" };
    }

    const ownerId = m.userId as number;
    if (await isUserOnFreePlan(ownerId)) {
      return { ok: false, error: "FEATURE_REQUIRES_PRO" };
    }

    const tablesCount = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query(`SELECT COUNT(*) as c FROM MenuTables WHERE menuId = @menuId`);
    const hasTables = Number(tablesCount.recordset[0]?.c) > 0;
    if (hasTables) {
      const tableMeta = await getMenuTablesColumnMeta();
      const activeSql = tableMeta.activeColumnQuoted
        ? ` AND ${tableMeta.activeColumnQuoted} = 1`
        : "";
      const match = await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .input("tableNumber", sql.NVarChar, safeTable)
        .query(
          `SELECT id FROM MenuTables WHERE menuId = @menuId AND tableNumber = @tableNumber${activeSql}`,
        );
      if (match.recordset.length === 0) {
        return { ok: false, error: "INVALID_TABLE" };
      }
    }

    let itemsResolved: StaffOrderItem[];
    try {
      itemsResolved = await enrichMenuItemNames(menuId, items);
    } catch (e) {
      logger.error("enrichMenuItemNames error:", e);
      return { ok: false, error: "SERVER_ERROR" };
    }

    const persisted = await createStaffTableCall(
      menuId,
      safeTable,
      customerName,
      itemsResolved,
    );
    if (!persisted) {
      return { ok: false, error: "SERVER_ERROR" };
    }

    return {
      ok: true,
      id: persisted.id,
      menuId,
      tableNumber: safeTable,
      createdAt: persisted.createdAt,
      customerName,
      items: itemsResolved,
    };
  } catch (error) {
    logger.error("processGuestStaffCall error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export type StaffTableCallRow = {
  id: number;
  menuId: number;
  tableNumber: string;
  createdAt: Date;
  customerName: string | null;
  items: StaffOrderItem[];
};

export type StaffTableCallHistoryRow = StaffTableCallRow & {
  acknowledgedAt: Date | null;
};

export type StaffTableCallHistoryPage = {
  rows: StaffTableCallHistoryRow[];
  total: number;
  page: number;
  limit: number;
};

export async function getMenuIdForStaff(
  staffId: number,
): Promise<number | null> {
  try {
    const meta = await getMenuStaffColumnMeta();
    const pool = await getPool();
    const r = await pool
      .request()
      .input("id", sql.Int, staffId)
      .query(`SELECT * FROM MenuStaff WHERE id = @id`);

    const row = r.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    if (!getStaffIsActive(row, meta)) {
      return null;
    }

    const raw = row.menuId;
    const menuId =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? parseInt(raw, 10)
          : NaN;
    return Number.isFinite(menuId) && menuId > 0 ? menuId : null;
  } catch (error) {
    logger.error("getMenuIdForStaff error:", error);
    return null;
  }
}

/** Read stored JSON (older rows may omit `price`). */
function parseOrderItemsFromStored(raw: unknown): StaffOrderItem[] {
  if (!Array.isArray(raw)) return [];
  const out: StaffOrderItem[] = [];
  for (const el of raw) {
    if (el == null || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const nameRaw = String(o.name ?? "").trim().slice(0, 500);

    let menuItemId: number | undefined;
    if (o.menuItemId != null && o.menuItemId !== "") {
      const n = Number(o.menuItemId);
      if (!Number.isFinite(n) || n <= 0) continue;
      menuItemId = Math.floor(n);
    }

    let quantity = 1;
    if (o.quantity != null && o.quantity !== "") {
      const q = Number(o.quantity);
      if (!Number.isFinite(q) || q < 1 || q > 999) continue;
      quantity = Math.floor(q);
    }

    let price: number | undefined;
    if (o.price != null && o.price !== "") {
      const pr = Number(o.price);
      if (Number.isFinite(pr) && pr >= 0 && pr <= 999_999_999.99) {
        price = Math.round(pr * 100) / 100;
      }
    }

    let notes: string | undefined;
    if (o.notes != null && o.notes !== "") {
      notes = String(o.notes).trim().slice(0, 500);
    }

    if (menuItemId !== undefined) {
      out.push({
        name: nameRaw || `Item ${menuItemId}`,
        menuItemId,
        quantity,
        ...(price !== undefined ? { price } : {}),
        ...(notes ? { notes } : {}),
      });
      continue;
    }

    if (!nameRaw) continue;
    out.push({
      name: nameRaw,
      quantity,
      ...(price !== undefined ? { price } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return out;
}

function parseOrderItemsJson(
  raw: string | null | undefined,
): StaffOrderItem[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseOrderItemsFromStored(parsed);
  } catch {
    return [];
  }
}

export async function createStaffTableCall(
  menuId: number,
  tableNumber: string,
  customerName: string | null,
  items: StaffOrderItem[],
): Promise<{ id: number; createdAt: Date } | null> {
  try {
    const pool = await getPool();
    const orderJson =
      items.length > 0 ? JSON.stringify(items) : null;
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("tableNumber", sql.NVarChar, tableNumber)
      .input("customerName", sql.NVarChar, customerName)
      .input("orderItemsJson", sql.NVarChar(sql.MAX), orderJson).query(`
        INSERT INTO StaffTableCalls (menuId, tableNumber, customerName, orderItemsJson)
        OUTPUT INSERTED.id, INSERTED.createdAt
        VALUES (@menuId, @tableNumber, @customerName, @orderItemsJson)
      `);
    const row = result.recordset[0];
    if (!row?.id) {
      return null;
    }
    return {
      id: row.id as number,
      createdAt: row.createdAt as Date,
    };
  } catch (error) {
    logger.error("createStaffTableCall error:", error);
    return null;
  }
}

export async function getPendingStaffTableCalls(
  menuId: number,
  limit = 100,
): Promise<StaffTableCallRow[]> {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("limit", sql.Int, Math.min(Math.max(limit, 1), 500))      .query(`
        SELECT TOP (@limit)
          id,
          menuId,
          tableNumber,
          createdAt,
          customerName,
          orderItemsJson
        FROM StaffTableCalls
        WHERE menuId = @menuId AND acknowledgedAt IS NULL
        ORDER BY createdAt ASC
      `);
    return (result.recordset as StaffTableCallRow[]).map((row) => ({
      id: row.id,
      menuId: row.menuId,
      tableNumber: String(row.tableNumber),
      createdAt: row.createdAt,
      customerName:
        row.customerName != null && String(row.customerName).trim() !== ""
          ? String(row.customerName).trim()
          : null,
      items: parseOrderItemsJson(
        (row as { orderItemsJson?: string }).orderItemsJson,
      ),
    }));
  } catch (error) {
    logger.error("getPendingStaffTableCalls error:", error);
    return [];
  }
}

/**
 * All table-call rows for a menu (newest first), pending and acknowledged.
 */
export async function getStaffTableCallsHistory(
  menuId: number,
  page = 1,
  limit = 20,
): Promise<StaffTableCallHistoryPage> {
  try {
    const pool = await getPool();
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
    const offset = (safePage - 1) * safeLimit;

    const totalResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query(`
        SELECT COUNT(*) as total
        FROM StaffTableCalls
        WHERE menuId = @menuId
      `);
    const total = Number(totalResult.recordset[0]?.total ?? 0);

    const rowsResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, safeLimit)
      .query(`
        SELECT
          id,
          menuId,
          tableNumber,
          createdAt,
          acknowledgedAt,
          customerName,
          orderItemsJson
        FROM StaffTableCalls
        WHERE menuId = @menuId
        ORDER BY createdAt DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const rows = (rowsResult.recordset as StaffTableCallHistoryRow[]).map(
      (row) => ({
        id: row.id,
        menuId: row.menuId,
        tableNumber: String(row.tableNumber),
        createdAt: row.createdAt,
        acknowledgedAt: row.acknowledgedAt ?? null,
        customerName:
          row.customerName != null && String(row.customerName).trim() !== ""
            ? String(row.customerName).trim()
            : null,
        items: parseOrderItemsJson(
          (row as { orderItemsJson?: string }).orderItemsJson,
        ),
      }),
    );

    return {
      rows,
      total,
      page: safePage,
      limit: safeLimit,
    };
  } catch (error) {
    logger.error("getStaffTableCallsHistory error:", error);
    return {
      rows: [],
      total: 0,
      page: Math.max(1, Math.floor(page)),
      limit: Math.min(Math.max(Math.floor(limit), 1), 500),
    };
  }
}

export async function acknowledgeStaffTableCall(
  callId: number,
  menuId: number,
): Promise<boolean> {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId).query(`
        UPDATE StaffTableCalls
        SET acknowledgedAt = SYSUTCDATETIME()
        WHERE id = @id AND menuId = @menuId AND acknowledgedAt IS NULL
      `);
    return (result.rowsAffected?.[0] ?? 0) > 0;
  } catch (error) {
    logger.error("acknowledgeStaffTableCall error:", error);
    return false;
  }
}
