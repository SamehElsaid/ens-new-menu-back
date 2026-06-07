import { getPool, sql } from "../config/database";
import { resolveFeaturedLogoCountryCode } from "../utils/countryCode.util";
import { ensureHomepageFeaturedLogosSchema } from "./homepageFeaturedLogosSchema.service";

export type HomepageFeaturedLogo = {
  id: number;
  menuId: number;
  userId: number;
  logo: string;
  countryCode: string | null;
  sortOrder: number;
  createdAt: string;
};

type MenuCandidate = {
  id: number;
  logo: string | null;
  isActive: boolean;
  currency: string | null;
};

export async function listHomepageFeaturedLogos(): Promise<HomepageFeaturedLogo[]> {
  await ensureHomepageFeaturedLogosSchema();
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT
      hfl.id,
      hfl.menuId,
      hfl.userId,
      hfl.logo,
      hfl.countryCode,
      hfl.sortOrder,
      hfl.createdAt,
      ISNULL(m.currency, 'SAR') AS menuCurrency,
      u.country AS userCountry
    FROM HomepageFeaturedLogos hfl
    INNER JOIN Menus m ON m.id = hfl.menuId
    INNER JOIN Users u ON u.id = hfl.userId
    ORDER BY hfl.sortOrder ASC, hfl.createdAt ASC
  `);

  return result.recordset.map((row) => ({
    id: row.id,
    menuId: row.menuId,
    userId: row.userId,
    logo: row.logo,
    countryCode: resolveFeaturedLogoCountryCode({
      currency: row.menuCurrency,
      country: row.userCountry,
    }),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  }));
}

export async function isMenuFeaturedOnHomepage(menuId: number): Promise<boolean> {
  await ensureHomepageFeaturedLogosSchema();
  const pool = await getPool();

  const result = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .query(`
      SELECT TOP 1 id
      FROM HomepageFeaturedLogos
      WHERE menuId = @menuId
    `);

  return result.recordset.length > 0;
}

export async function getUserFeaturedMenuId(userId: number): Promise<number | null> {
  await ensureHomepageFeaturedLogosSchema();
  const pool = await getPool();

  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT TOP 1 menuId
      FROM HomepageFeaturedLogos
      WHERE userId = @userId
      ORDER BY createdAt DESC
    `);

  return result.recordset[0]?.menuId ?? null;
}

async function pickMenuForUser(userId: number): Promise<MenuCandidate | null> {
  const pool = await getPool();

  const result = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT id, logo, isActive, ISNULL(currency, 'SAR') AS currency
    FROM Menus
    WHERE userId = @userId
    ORDER BY
      CASE WHEN isActive = 1 THEN 0 ELSE 1 END,
      createdAt ASC
  `);

  const menus = result.recordset as MenuCandidate[];
  return menus.find((menu) => menu.logo?.trim()) ?? null;
}

export async function addUserMenuToHomepageFeatured(
  userId: number,
): Promise<HomepageFeaturedLogo> {
  await ensureHomepageFeaturedLogosSchema();
  const pool = await getPool();

  const userResult = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT id, country
    FROM Users
    WHERE id = @userId AND role = 'user'
  `);

  if (userResult.recordset.length === 0) {
    throw new Error("USER_NOT_FOUND");
  }

  const menu = await pickMenuForUser(userId);
  if (!menu) {
    throw new Error("NO_MENU_WITH_LOGO");
  }

  const existing = await pool
    .request()
    .input("menuId", sql.Int, menu.id)
    .query(`
      SELECT TOP 1 id
      FROM HomepageFeaturedLogos
      WHERE menuId = @menuId
    `);

  if (existing.recordset.length > 0) {
    throw new Error("ALREADY_FEATURED");
  }

  const countryCode = resolveFeaturedLogoCountryCode({
    currency: menu.currency,
    country: userResult.recordset[0].country,
  });
  const sortResult = await pool.request().query(`
    SELECT ISNULL(MAX(sortOrder), 0) + 1 AS nextSortOrder
    FROM HomepageFeaturedLogos
  `);
  const sortOrder = sortResult.recordset[0]?.nextSortOrder ?? 1;

  const insertResult = await pool
    .request()
    .input("menuId", sql.Int, menu.id)
    .input("userId", sql.Int, userId)
    .input("logo", sql.NVarChar, menu.logo!.trim())
    .input("countryCode", sql.NVarChar, countryCode)
    .input("sortOrder", sql.Int, sortOrder)
    .query(`
      INSERT INTO HomepageFeaturedLogos (menuId, userId, logo, countryCode, sortOrder)
      OUTPUT INSERTED.id, INSERTED.menuId, INSERTED.userId, INSERTED.logo,
             INSERTED.countryCode, INSERTED.sortOrder, INSERTED.createdAt
      VALUES (@menuId, @userId, @logo, @countryCode, @sortOrder)
    `);

  return insertResult.recordset[0];
}

export async function removeUserFromHomepageFeatured(
  userId: number,
): Promise<boolean> {
  await ensureHomepageFeaturedLogosSchema();
  const pool = await getPool();

  const result = await pool.request().input("userId", sql.Int, userId).query(`
    DELETE FROM HomepageFeaturedLogos
    WHERE userId = @userId
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function countUsersOnHomepage(): Promise<number> {
  await ensureHomepageFeaturedLogosSchema();
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT COUNT(DISTINCT userId) AS usersOnHomepage
    FROM HomepageFeaturedLogos
  `);

  return result.recordset[0]?.usersOnHomepage ?? 0;
}
