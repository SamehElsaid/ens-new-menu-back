import { getPool, sql } from "../config/database";

export type BrandingEventType = "impression" | "click";

export async function recordBrandingEvent(
  slug: string,
  eventType: BrandingEventType,
): Promise<boolean> {
  const pool = await getPool();
  const menuResult = await pool
    .request()
    .input("slug", sql.NVarChar, slug)
    .query(`SELECT id FROM Menus WHERE slug = @slug`);

  if (!menuResult.recordset.length) return false;

  const menuId = menuResult.recordset[0].id as number;
  await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("eventType", sql.NVarChar, eventType)
    .query(`
      INSERT INTO MenuBrandingEvents (menuId, eventType) VALUES (@menuId, @eventType)
    `);

  return true;
}
