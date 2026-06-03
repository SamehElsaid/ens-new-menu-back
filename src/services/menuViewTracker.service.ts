import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";

export type MenuViewEntrySource = "qr" | "direct";

/** Record a public menu page view (+1 qr scan when entrySource is qr). */
export async function recordMenuView(
  menuId: number,
  options?: { entrySource?: MenuViewEntrySource },
): Promise<void> {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query(`
        INSERT INTO MenuViewEvents (menuId) VALUES (@menuId);
        UPDATE Menus SET viewCount = ISNULL(viewCount, 0) + 1 WHERE id = @menuId;
      `);
    if (options?.entrySource === "qr") {
      await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .query(`
          UPDATE Menus SET qrScanCount = ISNULL(qrScanCount, 0) + 1 WHERE id = @menuId;
        `);
    }
  } catch (err) {
    logger.warn("recordMenuView failed:", err);
  }
}

export function parseMenuEntrySource(
  querySrc: unknown,
  headerSrc: string | undefined,
  queryQr?: unknown,
): MenuViewEntrySource {
  const fromSrc =
    typeof querySrc === "string" && querySrc.toLowerCase() === "qr";
  const fromQr =
    queryQr !== undefined &&
    queryQr !== null &&
    String(queryQr).toLowerCase() !== "false" &&
    String(queryQr).toLowerCase() !== "0";
  const fromHeader = headerSrc?.toLowerCase() === "qr";
  return fromSrc || fromQr || fromHeader ? "qr" : "direct";
}

/** Record when a guest opens/clicks a product card on the public menu. */
export async function recordMenuItemClick(
  menuId: number,
  itemId: number,
): Promise<void> {
  if (!Number.isFinite(menuId) || menuId <= 0) return;
  if (!Number.isFinite(itemId) || itemId <= 0) return;
  try {
    const pool = await getPool();
    await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("itemId", sql.Int, itemId)
      .query(`
        INSERT INTO MenuItemViewEvents (menuId, itemId) VALUES (@menuId, @itemId)
      `);
  } catch (err) {
    logger.warn("recordMenuItemClick failed:", err);
  }
}
