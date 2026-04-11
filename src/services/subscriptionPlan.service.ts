import { getPool, sql } from "../config/database";

/**
 * True when the user has no paid plan (Free only).
 * Matches `/user/subscription` behavior: no active subscription row ⇒ Free.
 */
export async function isUserOnFreePlan(userId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT TOP 1 LOWER(LTRIM(RTRIM(p.name))) AS planName
      FROM Subscriptions s
      JOIN Plans p ON s.planId = p.id
      WHERE s.userId = @userId
        AND s.status = 'active'
        AND (s.endDate IS NULL OR s.endDate > GETDATE())
      ORDER BY s.id DESC
    `);

  if (result.recordset.length === 0) {
    return true;
  }

  return result.recordset[0].planName === "free";
}

export async function menuOwnerHasProPlan(menuId: number): Promise<boolean> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .query(`SELECT userId FROM Menus WHERE id = @menuId`);
  const uid = r.recordset[0]?.userId as number | undefined;
  if (uid == null) {
    return false;
  }
  return !(await isUserOnFreePlan(uid));
}
