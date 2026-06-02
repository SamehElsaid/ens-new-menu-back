import { getPool, sql } from "../config/database";

/** Increment click count for an active ad (menu or global). */
export async function recordAdClick(adId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("adId", sql.Int, adId)
    .query(`
      UPDATE Ads
      SET clickCount = clickCount + 1
      WHERE id = @adId AND isActive = 1
    `);
  return (result.rowsAffected[0] ?? 0) > 0;
}
