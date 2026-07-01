import { getPool, sql } from "../config/database";
import { ensureDeliverySchema } from "../schemas/delivery.schema";

export const MENU_DELIVERY_GOVERNORATE_COLUMNS =
  "id, nameAr, nameEn, price, lat, lan, createdAt, updatedAt";

export type MenuDeliverySettings = {
  deliveryOn: boolean;
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
      SELECT m.deliveryOn, m.deliveryPhone, m.deliveryWhatsAppOn, u.phoneNumber
      FROM Menus m
      INNER JOIN Users u ON u.id = m.userId
      WHERE m.id = @menuId
    `);

  if (menuResult.recordset.length === 0) {
    return {
      deliveryOn: false,
      deliveryPhone: null,
      phoneNumber: null,
      deliveryWhatsAppOn: true,
      governorates: [],
    };
  }

  const menu = menuResult.recordset[0] as {
    deliveryOn: boolean | number;
    deliveryPhone: string | null;
    phoneNumber: string | null;
    deliveryWhatsAppOn?: boolean | number | null;
  };

  const governoratesResult = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .query(`
      SELECT ${MENU_DELIVERY_GOVERNORATE_COLUMNS}
      FROM MenuDeliveryGovernorates
      WHERE menuId = @menuId
      ORDER BY id
    `);

  return {
    deliveryOn: Boolean(menu.deliveryOn),
    deliveryPhone: menu.deliveryPhone ?? null,
    phoneNumber: menu.phoneNumber ?? null,
    deliveryWhatsAppOn:
      menu.deliveryWhatsAppOn == null ? true : Boolean(menu.deliveryWhatsAppOn),
    governorates: governoratesResult.recordset as Record<string, unknown>[],
  };
}

export async function resolveMenuDeliveryGovernorate(
  menuId: number,
  governorateId: number,
): Promise<
  | { ok: true; governorate: MenuDeliveryGovernorate }
  | { ok: false }
> {
  await ensureDeliverySchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("governorateId", sql.Int, governorateId)
    .query(`
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
