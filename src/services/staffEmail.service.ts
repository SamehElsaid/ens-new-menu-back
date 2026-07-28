import { getPool, sql } from "../config/database";
import {
  getMenuStaffColumnMeta,
  quoteMenuStaffIdent,
} from "../config/menuStaffColumns";

export type StaffEmailConflict = "staff" | "owner" | null;

/**
 * Login checks `Users` before `MenuStaff`, so a staff email that already
 * belongs to an owner/admin account would never reach the staff login path.
 * Reject both MenuStaff duplicates and Users collisions.
 */
export async function findStaffEmailConflict(
  email: string,
  excludeStaffId?: number,
): Promise<StaffEmailConflict> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return null;

  const pool = await getPool();

  const ownerCheck = await pool
    .request()
    .input("email", sql.NVarChar, normalizedEmail)
    .query(`
      SELECT TOP 1 id
      FROM Users
      WHERE LOWER(email) = @email
    `);
  if (ownerCheck.recordset.length > 0) return "owner";

  const meta = await getMenuStaffColumnMeta();
  if (!meta.emailKey) return null;

  const emailCol = quoteMenuStaffIdent(meta.emailKey);
  const request = pool.request().input("email", sql.NVarChar, normalizedEmail);
  const excludeSql =
    excludeStaffId != null ? " AND id <> @excludeStaffId" : "";
  if (excludeStaffId != null) {
    request.input("excludeStaffId", sql.Int, excludeStaffId);
  }

  const staffCheck = await request.query(`
    SELECT TOP 1 id
    FROM MenuStaff
    WHERE LOWER(${emailCol}) = @email${excludeSql}
  `);
  if (staffCheck.recordset.length > 0) return "staff";

  return null;
}
