import { getPool, sql } from "../config/database";
import { ensureDeliverySchema } from "../schemas/delivery.schema";
import { hasCapability } from "./planCapabilities.service";
import {
  quoteBranchDelivery,
  type BranchDeliveryQuote,
} from "./branchDelivery.service";

export type DeliveryMode = "governorates" | "distance";

export const DELIVERY_MODES: DeliveryMode[] = ["governorates", "distance"];

export function normalizeDeliveryMode(raw: unknown): DeliveryMode {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "distance" ? "distance" : "governorates";
}

export const MENU_DELIVERY_GOVERNORATE_COLUMNS =
  "id, nameAr, nameEn, price, lat, lan, createdAt, updatedAt";

export type MenuDeliverySettings = {
  deliveryOn: boolean;
  deliveryMode: DeliveryMode;
  deliveryPhone: string | null;
  phoneNumber: string | null;
  deliveryWhatsAppOn: boolean;
  governorates: Record<string, unknown>[];
};

export type MenuDeliveryGovernorate = {
  id: number;
  nameAr: string;
  nameEn: string;
  price: number;
  lat: number | null;
  lan: number | null;
};

export async function assertMenuOwnedByUser(
  menuId: number,
  userId: number,
): Promise<boolean> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("userId", sql.Int, userId)
    .query("SELECT id FROM Menus WHERE id = @menuId AND userId = @userId");
  return r.recordset.length > 0;
}

export async function getMenuOwnerPhone(
  menuId: number,
): Promise<{ deliveryPhone: string | null; phoneNumber: string | null }> {
  const pool = await getPool();
  const r = await pool.request().input("menuId", sql.Int, menuId).query(`
    SELECT m.deliveryPhone, u.phoneNumber
    FROM Menus m
    INNER JOIN Users u ON u.id = m.userId
    WHERE m.id = @menuId
  `);
  if (r.recordset.length === 0) {
    throw new Error("Menu not found");
  }
  const row = r.recordset[0] as {
    deliveryPhone: string | null;
    phoneNumber: string | null;
  };
  return {
    deliveryPhone: row.deliveryPhone?.trim() || null,
    phoneNumber: row.phoneNumber?.trim() || null,
  };
}

export async function fetchMenuDeliverySettings(
  menuId: number,
): Promise<MenuDeliverySettings> {
  await ensureDeliverySchema();
  const pool = await getPool();

  const menuResult = await pool.request().input("menuId", sql.Int, menuId)
    .query(`
      SELECT m.deliveryOn, m.deliveryMode, m.deliveryPhone, m.deliveryWhatsAppOn, u.phoneNumber
      FROM Menus m
      INNER JOIN Users u ON u.id = m.userId
      WHERE m.id = @menuId
    `);

  if (menuResult.recordset.length === 0) {
    return {
      deliveryOn: false,
      deliveryMode: "governorates",
      deliveryPhone: null,
      phoneNumber: null,
      deliveryWhatsAppOn: true,
      governorates: [],
    };
  }

  const menu = menuResult.recordset[0] as {
    deliveryOn: boolean | number;
    deliveryMode?: string | null;
    deliveryPhone: string | null;
    phoneNumber: string | null;
    deliveryWhatsAppOn?: boolean | number | null;
  };

  const governoratesResult = await pool
    .request()
    .input("menuId", sql.Int, menuId).query(`
      SELECT ${MENU_DELIVERY_GOVERNORATE_COLUMNS}
      FROM MenuDeliveryGovernorates
      WHERE menuId = @menuId
      ORDER BY id
    `);

  return {
    deliveryOn: Boolean(menu.deliveryOn),
    deliveryMode: normalizeDeliveryMode(menu.deliveryMode),
    deliveryPhone: menu.deliveryPhone ?? null,
    phoneNumber: menu.phoneNumber ?? null,
    deliveryWhatsAppOn:
      menu.deliveryWhatsAppOn == null ? true : Boolean(menu.deliveryWhatsAppOn),
    governorates: governoratesResult.recordset as Record<string, unknown>[],
  };
}

export async function getMenuDeliveryMode(menuId: number): Promise<DeliveryMode> {
  await ensureDeliverySchema();
  const pool = await getPool();
  const r = await pool.request().input("menuId", sql.Int, menuId).query(`
    SELECT deliveryMode FROM Menus WHERE id = @menuId
  `);
  return normalizeDeliveryMode(r.recordset[0]?.deliveryMode);
}

/** Stored mode, but Free owners always behave as governorates (Pro data kept, feature locked). */
export async function getEffectiveMenuDeliveryMode(
  menuId: number,
): Promise<DeliveryMode> {
  const modes = await getEffectiveMenuDeliveryModesForMenus([menuId]);
  return modes.get(menuId) ?? "governorates";
}

/** Batch lookup of effective delivery mode (distance only when plan allows maps). */
export async function getEffectiveMenuDeliveryModesForMenus(
  menuIds: number[],
): Promise<Map<number, DeliveryMode>> {
  const safeIds = [
    ...new Set(menuIds.filter((n) => Number.isFinite(n) && n > 0)),
  ];
  const map = new Map<number, DeliveryMode>();
  if (safeIds.length === 0) return map;

  await ensureDeliverySchema();
  const pool = await getPool();
  const inList = safeIds.join(",");
  const r = await pool.request().query(`
    SELECT m.id, m.deliveryMode, m.userId
    FROM Menus m
    WHERE m.id IN (${inList})
  `);

  const mapsByUser = new Map<number, boolean>();
  for (const row of r.recordset as {
    id: number;
    deliveryMode?: string | null;
    userId: number;
  }[]) {
    let canUseMaps = mapsByUser.get(row.userId);
    if (canUseMaps === undefined) {
      canUseMaps = await hasCapability(row.userId, "advancedDeliveryMaps");
      mapsByUser.set(row.userId, canUseMaps);
    }
    map.set(
      row.id,
      canUseMaps
        ? normalizeDeliveryMode(row.deliveryMode)
        : "governorates",
    );
  }

  return map;
}

export type ResolvedBranchDelivery = {
  branchId: number;
  quote: BranchDeliveryQuote;
};

export async function resolveBranchDeliveryQuote(
  menuId: number,
  branchId: number,
  customerLat: number,
  customerLng: number,
): Promise<
  | { ok: true; delivery: ResolvedBranchDelivery }
  | {
      ok: false;
      reason: "branch_not_found" | "out_of_range" | "not_configured";
      quote?: BranchDeliveryQuote;
    }
> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("branchId", sql.Int, branchId)
    .query(`
      SELECT
        b.latitude,
        b.longitude,
        b.deliveryBasePrice,
        b.deliveryPricePerKm,
        b.maxDeliveryRadiusKm
      FROM Branches b
      WHERE b.menuId = @menuId AND b.id = @branchId
    `);

  if (result.recordset.length === 0) {
    return { ok: false, reason: "branch_not_found" };
  }

  const branch = result.recordset[0];
  if (
    branch.latitude == null ||
    branch.longitude == null ||
    branch.deliveryBasePrice == null ||
    branch.deliveryPricePerKm == null ||
    branch.maxDeliveryRadiusKm == null
  ) {
    return { ok: false, reason: "not_configured" };
  }

  const quote = quoteBranchDelivery(
    {
      latitude: branch.latitude,
      longitude: branch.longitude,
      deliveryBasePrice: branch.deliveryBasePrice,
      deliveryPricePerKm: branch.deliveryPricePerKm,
      maxDeliveryRadiusKm: branch.maxDeliveryRadiusKm,
    },
    customerLat,
    customerLng,
  );

  if (!quote.inRange) {
    return { ok: false, reason: "out_of_range", quote };
  }

  return { ok: true, delivery: { branchId, quote } };
}

export async function resolveMenuDeliveryGovernorate(
  menuId: number,
  governorateId: number,
): Promise<{ ok: true; governorate: MenuDeliveryGovernorate } | { ok: false }> {
  await ensureDeliverySchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("governorateId", sql.Int, governorateId).query(`
      SELECT id, nameAr, nameEn, price, lat, lan
      FROM MenuDeliveryGovernorates
      WHERE id = @governorateId AND menuId = @menuId
    `);

  const row = result.recordset[0] as MenuDeliveryGovernorate | undefined;
  if (!row) return { ok: false };
  return { ok: true, governorate: row };
}

export async function isMenuDeliveryEnabled(menuId: number): Promise<boolean> {
  await ensureDeliverySchema();
  const pool = await getPool();
  const r = await pool.request().input("menuId", sql.Int, menuId).query(`
    SELECT deliveryOn FROM Menus WHERE id = @menuId
  `);
  return Boolean(r.recordset[0]?.deliveryOn);
}
