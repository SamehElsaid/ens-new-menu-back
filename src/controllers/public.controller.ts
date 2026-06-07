import { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { getActivePlansForDisplay } from "../services/plans.service";
import { getLocaleFromAcceptLanguage } from "../utils/localeHelper";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { normalizeMenuTableRow } from "../utils/normalizeMenuTableRow";
import {
  recordMenuItemClick,
  parseMenuEntrySource,
  recordMenuView,
} from "../services/menuViewTracker.service";
import { recordAdClick } from "../services/adTracking.service";
import { listHomepageFeaturedLogos } from "../services/homepageFeaturedLogos.service";

/** Optional table from QR: `?tableNumber=` or `?table=` (max 50 chars). */
function parsePublicMenuTableNumber(req: Request): string | null {
  const raw = req.query.tableNumber ?? req.query.table;
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 50);
  return t.length > 0 ? t : null;
}

/** Same row `id` as in GET /api/menus/:menuId/tables — `?tableId=`. */
function parsePublicMenuTableId(req: Request): number | null {
  const raw = req.query.tableId;
  if (raw === undefined || raw === null || raw === "") return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(String(s), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Same rows as GET /api/menus/:menuId/tables (public read, no auth). */
async function fetchPublicMenuTablesForMenu(
  pool: Awaited<ReturnType<typeof getPool>>,
  menuId: number,
): Promise<Record<string, unknown>[]> {
  const exists = await pool.request().query(`
    SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MenuTables'
  `);
  if (!exists.recordset[0]?.count) return [];
  const result = await pool.request().input("menuId", sql.Int, menuId).query(`
      SELECT *
      FROM MenuTables
      WHERE menuId = @menuId
      ORDER BY id DESC
    `);
  return (result.recordset as Record<string, unknown>[]).map((row) =>
    normalizeMenuTableRow(row),
  );
}

function tableRowNumber(row: Record<string, unknown>): string | null {
  const n = row.tableNumber ?? row.TableNumber;
  if (n === undefined || n === null) return null;
  return String(n).trim();
}

function tableRowId(row: Record<string, unknown>): number | null {
  const id = row.id ?? row.Id;
  if (id === undefined || id === null) return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve `table` like a row from GET /api/menus/:menuId/tables.
 * - `?tableId=12` → match MenuTables.id
 * - `?table=` / `?tableNumber=` → match tableNumber; if no hit and value is all digits, match id
 */
function resolvePublicMenuTable(
  tables: Record<string, unknown>[],
  opts: { tableNumber: string | null; tableId: number | null },
): Record<string, unknown> | null {
  const { tableNumber, tableId } = opts;

  if (tableId !== null) {
    const hit = tables.find((row) => tableRowId(row) === tableId);
    return hit ?? null;
  }

  if (!tableNumber) return null;

  const needle = tableNumber.trim();
  const byLabel = tables.find((row) => {
    const t = tableRowNumber(row);
    return t !== null && t === needle;
  });
  if (byLabel) return byLabel;

  if (/^\d+$/.test(needle)) {
    const id = parseInt(needle, 10);
    const byId = tables.find((row) => tableRowId(row) === id);
    if (byId) return byId;
  }

  return { tableNumber: needle };
}

// Get all menus (no auth) - returns slug only as array
export const getAllPublicMenus = async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT m.slug FROM Menus m ORDER BY m.createdAt DESC
    `);
    const slugs = result.recordset.map((r: { slug: string }) => r.slug);
    res.json(slugs);
  } catch (error) {
    console.error("Get all public menus error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetMenus);
  }
};

// Get public menu by slug
export const getPublicMenu = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const locale =
      (req.query.locale as string) === "ar"
        ? "ar"
        : (req.query.locale as string) === "en"
          ? "en"
          : getLocaleFromAcceptLanguage(req, "en");

    const tableNumber = parsePublicMenuTableNumber(req);
    const tableId = parsePublicMenuTableId(req);

    const pool = await getPool();

    // Get menu details with translations and owner's subscription plan
    const menuResult = await pool
      .request()
      .input("slug", sql.NVarChar, slug)
      .input("locale", sql.NVarChar, locale).query(`
        SELECT 
          m.id,
          m.slug,
          m.logo,
          m.theme,
          ISNULL(m.currency, 'SAR') as currency,
          m.isActive,
          m.userId,
          m.footerLogo,
          m.footerDescriptionEn,
          m.footerDescriptionAr,
          m.socialFacebook,
          m.socialInstagram,
          m.socialTwitter,
          m.socialWhatsapp,
          m.addressEn,
          m.addressAr,
          m.phone,
          m.workingHours,
          mt.name,
          mt.description,
          mt.locale,
          CASE
            WHEN p.id IS NULL OR ISNULL(p.priceMonthly, 0) = 0 OR LOWER(p.name) = 'free' THEN 'free'
            ELSE LOWER(p.name)
          END as ownerPlanType
        FROM Menus m
        LEFT JOIN MenuTranslations mt ON m.id = mt.menuId AND mt.locale = @locale
        LEFT JOIN Users u ON m.userId = u.id
        LEFT JOIN Subscriptions s ON u.id = s.userId 
          AND s.status = 'active' 
          AND (s.endDate IS NULL OR s.endDate > GETDATE())
        LEFT JOIN Plans p ON s.planId = p.id
        WHERE m.slug = @slug
      `);

    if (menuResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    const menu = menuResult.recordset[0];

    // إذا كانت القائمة غير نشطة، أرسل بيانات محدودة لصفحة الصيانة فقط
    if (!menu.isActive) {
      const tables = await fetchPublicMenuTablesForMenu(pool, menu.id);
      const table = resolvePublicMenuTable(tables, { tableNumber, tableId });
      res.setHeader("Content-Language", locale);
      return res.json({
        success: true,
        data: {
          locale,
          menu: {
            id: menu.id,
            name: menu.name,
            description: menu.description,
            logo: menu.logo,
            theme: menu.theme,
            currency: menu.currency || "SAR",
            slug: menu.slug,
            isActive: menu.isActive,
            locale: menu.locale,
            ownerPlanType: menu.ownerPlanType || "free",
            footerLogo: menu.footerLogo,
            footerDescriptionEn: menu.footerDescriptionEn,
            footerDescriptionAr: menu.footerDescriptionAr,
            socialFacebook: menu.socialFacebook,
            socialInstagram: menu.socialInstagram,
            socialTwitter: menu.socialTwitter,
            socialWhatsapp: menu.socialWhatsapp,
            table,
            tables,
          },
          items: [],
          itemsByCategory: {},
          branches: [],
          rating: {
            average: 0,
            total: 0,
          },
        },
      });
    }

    // Check if Categories table exists and if categoryId column exists
    const categoriesTableCheck = await pool.request().query(`
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'Categories'
      `);

    const hasCategoriesTable = categoriesTableCheck.recordset[0].count > 0;

    const columnCheck = await pool.request().query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'MenuItems' 
        AND COLUMN_NAME IN ('categoryId', 'originalPrice', 'discountPercent')
      `);

    const existingColumns = columnCheck.recordset.map(
      (r: any) => r.COLUMN_NAME,
    );
    const hasCategoryId = existingColumns.includes("categoryId");
    const hasOriginalPrice = existingColumns.includes("originalPrice");
    const hasDiscountPercent = existingColumns.includes("discountPercent");

    // Get categories if Categories table exists with both locales
    let categories: any[] = [];
    if (hasCategoriesTable) {
      const categoriesResult = await pool
        .request()
        .input("menuId", sql.Int, menu.id)
        .input("locale", sql.NVarChar, locale).query(`
          SELECT 
            c.id,
            c.image,
            c.sortOrder,
            c.isActive,
            ct.name,
            ctAr.name as nameAr,
            ctEn.name as nameEn
          FROM Categories c
          LEFT JOIN CategoryTranslations ct ON c.id = ct.categoryId AND ct.locale = @locale
          LEFT JOIN CategoryTranslations ctAr ON c.id = ctAr.categoryId AND ctAr.locale = 'ar'
          LEFT JOIN CategoryTranslations ctEn ON c.id = ctEn.categoryId AND ctEn.locale = 'en'
          WHERE c.menuId = @menuId AND c.isActive = 1
          ORDER BY c.sortOrder ASC, c.createdAt DESC
        `);
      categories = categoriesResult.recordset;
    }

    // Build SELECT fields for menu items with both locales
    const selectFields: string[] = [
      "mi.id",
      "mi.price",
      "mi.image",
      "mi.available",
      "mi.sortOrder",
    ];

    if (hasCategoryId) {
      selectFields.push("mi.categoryId");
    }
    selectFields.push("mi.category"); // Keep for backward compatibility

    if (hasOriginalPrice) {
      selectFields.push("mi.originalPrice");
    }
    if (hasDiscountPercent) {
      selectFields.push("mi.discountPercent");
    }

    // Get translations for both Arabic and English
    selectFields.push(
      "mitAr.name as nameAr",
      "mitAr.description as descriptionAr",
      "mitEn.name as nameEn",
      "mitEn.description as descriptionEn",
      "mit.name",
      "mit.description",
    );

    // Add category names for both locales if Categories table exists
    if (hasCategoriesTable && hasCategoryId) {
      selectFields.push(
        "ctAr.name as categoryNameAr",
        "ctEn.name as categoryNameEn",
        "ct.name as categoryName",
      );
    }

    // Build JOIN clause with both locales
    let joinClause = `
      LEFT JOIN MenuItemTranslations mit ON mi.id = mit.menuItemId AND mit.locale = @locale
      LEFT JOIN MenuItemTranslations mitAr ON mi.id = mitAr.menuItemId AND mitAr.locale = 'ar'
      LEFT JOIN MenuItemTranslations mitEn ON mi.id = mitEn.menuItemId AND mitEn.locale = 'en'`;

    if (hasCategoriesTable && hasCategoryId) {
      joinClause += `
          LEFT JOIN Categories c ON mi.categoryId = c.id
          LEFT JOIN CategoryTranslations ct ON c.id = ct.categoryId AND ct.locale = @locale
          LEFT JOIN CategoryTranslations ctAr ON c.id = ctAr.categoryId AND ctAr.locale = 'ar'
          LEFT JOIN CategoryTranslations ctEn ON c.id = ctEn.categoryId AND ctEn.locale = 'en'`;
    }

    // Get menu items with translations
    const itemsQuery = `
      SELECT 
        ${selectFields.join(",\n        ")}
      FROM MenuItems mi
      ${joinClause}
      WHERE mi.menuId = @menuId AND mi.available = 1
      ORDER BY mi.sortOrder ASC, mi.createdAt DESC
    `;

    const itemsResult = await pool
      .request()
      .input("menuId", sql.Int, menu.id)
      .input("locale", sql.NVarChar, locale)
      .query(itemsQuery);

    // Get branches with translations
    const branchesResult = await pool
      .request()
      .input("menuId", sql.Int, menu.id)
      .input("locale", sql.NVarChar, locale).query(`
        SELECT 
          b.id,
          b.phone,
          b.latitude,
          b.longitude,
          bt.name,
          bt.address,
          bt.locale
        FROM Branches b
        LEFT JOIN BranchTranslations bt ON b.id = bt.branchId AND bt.locale = @locale
        WHERE b.menuId = @menuId
      `);

    // Get ratings
    const ratingsResult = await pool.request().input("menuId", sql.Int, menu.id)
      .query(`
        SELECT 
          AVG(CAST(stars AS FLOAT)) as averageRating,
          COUNT(*) as totalRatings
        FROM Ratings
        WHERE menuId = @menuId
      `);

    const rating = ratingsResult.recordset[0];

    // Group items by category
    // If using Categories table, group by categoryId and category name
    // Otherwise, use the old category string field
    const itemsByCategory: Record<string, any[]> = {};

    if (hasCategoriesTable && hasCategoryId) {
      // Group by category ID and name
      itemsResult.recordset.forEach((item: any) => {
        const categoryKey = item.categoryId
          ? `category_${item.categoryId}`
          : item.category || "other";

        if (!itemsByCategory[categoryKey]) {
          itemsByCategory[categoryKey] = [];
        }
        itemsByCategory[categoryKey].push(item);
      });
    } else {
      // Fallback to old category string grouping
      itemsResult.recordset.forEach((item: any) => {
        const categoryKey = item.category || "other";
        if (!itemsByCategory[categoryKey]) {
          itemsByCategory[categoryKey] = [];
        }
        itemsByCategory[categoryKey].push(item);
      });
    }

    // Get menu customizations if available
    const customizationsResult = await pool
      .request()
      .input("menuId", sql.Int, menu.id).query(`
        SELECT 
          primaryColor, secondaryColor, backgroundColor, textColor,
          heroTitleAr, heroSubtitleAr, heroTitleEn, heroSubtitleEn
        FROM MenuCustomizations
        WHERE menuId = @menuId
      `);

    const customizations =
      customizationsResult.recordset.length > 0
        ? customizationsResult.recordset[0]
        : null;

    const planType =
      menu.ownerPlanType && menu.ownerPlanType !== "free" ? "paid" : "free";
    let ads: any[] = [];

    if (planType === "free") {
      // If free plan, show global ads
      const globalAdsResult = await pool.request().query(`
        SELECT TOP (10)
          id, title, titleAr, content, contentAr, imageUrl, linkUrl,
          position, displayOrder
        FROM Ads
        WHERE adType = 'global' AND isActive = 1
        ORDER BY displayOrder ASC, createdAt DESC
      `);
      ads = globalAdsResult.recordset;
    } else {
      // If paid plan, show custom menu ads
      const menuAdsResult = await pool
        .request()
        .input("menuId", sql.Int, menu.id).query(`
          SELECT TOP (10)
            id, title, titleAr, content, contentAr, imageUrl, linkUrl,
            position, displayOrder
          FROM Ads
          WHERE menuId = @menuId AND adType = 'menu' AND isActive = 1
          ORDER BY displayOrder ASC, createdAt DESC
        `);
      ads = menuAdsResult.recordset;
    }

    // Increment impression count for returned ads
    if (ads.length > 0) {
      const adIds = ads.map((ad: any) => ad.id);
      await pool.request().query(`
        UPDATE Ads 
        SET impressionCount = impressionCount + 1 
        WHERE id IN (${adIds.join(",")})
      `);
    }

    const tables = await fetchPublicMenuTablesForMenu(pool, menu.id);
    const table = resolvePublicMenuTable(tables, { tableNumber, tableId });

    res.json({
      success: true,
      data: {
        locale,
        menu: {
          id: menu.id,
          name: menu.name,
          description: menu.description,
          logo: menu.logo,
          theme: menu.theme,
          currency: menu.currency || "SAR",
          slug: menu.slug,
          isActive: menu.isActive,
          locale: menu.locale,
          ownerPlanType: menu.ownerPlanType || "free", // Add owner's plan type
          footerLogo: menu.footerLogo,
          footerDescriptionEn: menu.footerDescriptionEn,
          footerDescriptionAr: menu.footerDescriptionAr,
          socialFacebook: menu.socialFacebook,
          socialInstagram: menu.socialInstagram,
          socialTwitter: menu.socialTwitter,
          socialWhatsapp: menu.socialWhatsapp,
          addressEn: menu.addressEn,
          addressAr: menu.addressAr,
          phone: menu.phone,
          workingHours: menu.workingHours
            ? typeof menu.workingHours === "string"
              ? JSON.parse(menu.workingHours)
              : menu.workingHours
            : null,
          table,
          tables,
        },
        customizations,
        categories: categories, // Add categories array
        items: itemsResult.recordset,
        itemsByCategory,
        branches: branchesResult.recordset,
        rating: {
          average: rating.averageRating
            ? parseFloat(rating.averageRating.toFixed(1))
            : 0,
          total: rating.totalRatings,
        },
        ads: ads, // Add ads array
      },
    });
  } catch (error: any) {
    console.error("Error fetching public menu:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch menu",
      error: error.message,
    });
  }
};

/** GET /api/public/menu/:slug/view — page view (+1 qr scan when ?qr or ?src=qr). */
export const getMenuView = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const slug = decodeURIComponent(String(req.params.slug ?? "")).trim();
  if (!slug) {
    res.status(400).json({ ok: false });
    return;
  }

  try {
    const pool = await getPool();
    const menuResult = await pool
      .request()
      .input("slug", sql.NVarChar, slug)
      .query(`SELECT id FROM Menus WHERE slug = @slug AND isActive = 1`);

    const menuId = Number(menuResult.recordset[0]?.id);
    if (!Number.isFinite(menuId) || menuId <= 0) {
      res.status(404).send();
      return;
    }

    const entrySource = parseMenuEntrySource(
      req.query.src,
      req.get("x-menu-entry-src"),
      req.query.qr,
    );
    void recordMenuView(menuId, { entrySource });
    res.status(204).send();
  } catch {
    res.status(204).send();
  }
};

/** POST /api/public/menu/:slug/items/:itemId/view — product card click (analytics). */
export const postMenuItemView = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const slug = decodeURIComponent(String(req.params.slug ?? "")).trim();
  const itemId = parseInt(String(req.params.itemId ?? ""), 10);

  if (!slug || !Number.isFinite(itemId) || itemId <= 0) {
    res.status(400).json({ ok: false });
    return;
  }

  try {
    const pool = await getPool();
    const menuResult = await pool
      .request()
      .input("slug", sql.NVarChar, slug)
      .query(`SELECT id FROM Menus WHERE slug = @slug AND isActive = 1`);

    const menuId = Number(menuResult.recordset[0]?.id);
    if (!Number.isFinite(menuId) || menuId <= 0) {
      res.status(404).send();
      return;
    }

    const itemResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("itemId", sql.Int, itemId)
      .query(`
        SELECT 1 AS ok FROM MenuItems
        WHERE id = @itemId AND menuId = @menuId
      `);

    if (!itemResult.recordset.length) {
      res.status(404).send();
      return;
    }

    void recordMenuItemClick(menuId, itemId);
    res.status(204).send();
  } catch {
    res.status(204).send();
  }
};

// Submit rating
export const submitRating = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { stars, comment, customerName } = req.body;

    // Validation
    if (!stars || stars < 1 || stars > 5) {
      return res.status(400).json({
        success: false,
        message: "Stars must be between 1 and 5",
      });
    }

    const pool = await getPool();

    // Get menu ID from slug
    const menuResult = await pool.request().input("slug", sql.NVarChar, slug)
      .query(`
        SELECT id FROM Menus 
        WHERE slug = @slug AND isActive = 1
      `);

    if (menuResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    const menuId = menuResult.recordset[0].id;
    const ipAddress = req.ip || req.socket.remoteAddress || "";

    // Check if IP already rated in the last 24 hours
    const rateCheckResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("ipAddress", sql.NVarChar, ipAddress).query(`
        SELECT id FROM Ratings 
        WHERE menuId = @menuId 
        AND ipAddress = @ipAddress 
        AND createdAt > DATEADD(hour, -24, GETDATE())
      `);

    if (rateCheckResult.recordset.length > 0) {
      return res.status(429).json({
        success: false,
        message: "You can only rate once every 24 hours",
      });
    }

    // Insert rating
    await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("stars", sql.Int, stars)
      .input("comment", sql.NVarChar, comment || null)
      .input("customerName", sql.NVarChar, customerName || null)
      .input("ipAddress", sql.NVarChar, ipAddress).query(`
        INSERT INTO Ratings (menuId, stars, comment, customerName, ipAddress)
        VALUES (@menuId, @stars, @comment, @customerName, @ipAddress)
      `);

    res.status(201).json({
      success: true,
      message: "Rating submitted successfully",
    });
  } catch (error: any) {
    console.error("Error submitting rating:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit rating",
      error: error.message,
    });
  }
};

// Get all active plans for public display (landing page)
export const getPublicPlans = async (req: Request, res: Response) => {
  try {
    const plans = await getActivePlansForDisplay(null);
    res.json({
      success: true,
      plans,
    });
  } catch (error: any) {
    console.error("Error fetching public plans:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch plans",
      error: error.message,
    });
  }
};

// Get recent ratings
export const getRecentRatings = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const pool = await getPool();

    // Get menu ID from slug
    const menuResult = await pool.request().input("slug", sql.NVarChar, slug)
      .query(`
        SELECT id FROM Menus 
        WHERE slug = @slug AND isActive = 1
      `);

    if (menuResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    const menuId = menuResult.recordset[0].id;

    // Get recent ratings
    const ratingsResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("limit", sql.Int, limit).query(`
        SELECT TOP (@limit)
          stars,
          comment,
          customerName,
          createdAt
        FROM Ratings
        WHERE menuId = @menuId
        ORDER BY createdAt DESC
      `);

    res.json({
      success: true,
      data: {
        ratings: ratingsResult.recordset,
      },
    });
  } catch (error: any) {
    console.error("Error fetching ratings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ratings",
      error: error.message,
    });
  }
};

// Get active global ads
export const getActiveAds = async (req: Request, res: Response) => {
  try {
    const position = req.query.position as string;
    const limit = parseInt(req.query.limit as string) || 5;

    const pool = await getPool();

    let query = `
      SELECT TOP (@limit)
        id, title, titleAr, content, contentAr, imageUrl, linkUrl,
        position, displayOrder
      FROM Ads
      WHERE adType = 'global' AND isActive = 1
    `;

    // Filter by position if provided
    if (position) {
      query += ` AND position = @position`;
    }

    query += `
      ORDER BY displayOrder ASC, createdAt DESC
    `;

    const request = pool.request().input("limit", sql.Int, limit);

    if (position) {
      request.input("position", sql.NVarChar, position);
    }

    const result = await request.query(query);

    // Increment impression count for returned ads
    if (result.recordset.length > 0) {
      const adIds = result.recordset.map((ad: any) => ad.id);
      await pool.request().query(`
          UPDATE Ads 
          SET impressionCount = impressionCount + 1 
          WHERE id IN (${adIds.join(",")})
        `);
    }

    res.json({
      success: true,
      data: {
        ads: result.recordset,
      },
    });
  } catch (error: any) {
    console.error("Error fetching ads:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ads",
      error: error.message,
    });
  }
};

// Get menu custom ads (for public display)
export const getMenuCustomAds = async (req: Request, res: Response) => {
  try {
    const { menuId } = req.params;
    const position = req.query.position as string;
    const limit = parseInt(req.query.limit as string) || 5;

    const pool = await getPool();

    // Check menu owner's plan type
    const menuOwnerResult = await pool
      .request()
      .input("menuId", sql.Int, menuId).query(`
        SELECT 
          m.userId,
          s.billingCycle,
          CASE 
            WHEN s.billingCycle IS NULL OR s.billingCycle = 'free' THEN 'free'
            ELSE 'paid'
          END as planType
        FROM Menus m
        LEFT JOIN Subscriptions s ON m.userId = s.userId 
          AND s.status = 'active' 
          AND (s.endDate IS NULL OR s.endDate > GETDATE())
        WHERE m.id = @menuId
      `);

    if (menuOwnerResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    const planType = menuOwnerResult.recordset[0].planType;

    let query = "";
    let request = pool.request().input("limit", sql.Int, limit);

    // If free plan, show global ads instead of custom ads
    if (planType === "free") {
      query = `
        SELECT TOP (@limit)
          id, title, titleAr, content, contentAr, imageUrl, linkUrl,
          position, displayOrder
        FROM Ads
        WHERE adType = 'global' AND isActive = 1
      `;

      if (position) {
        query += ` AND position = @position`;
        request.input("position", sql.NVarChar, position);
      }

      query += `
        ORDER BY displayOrder ASC, createdAt DESC
      `;
    }
    // If paid plan, show custom menu ads
    else {
      query = `
        SELECT TOP (@limit)
          id, title, titleAr, content, contentAr, imageUrl, linkUrl,
          position, displayOrder
        FROM Ads
        WHERE menuId = @menuId AND adType = 'menu' AND isActive = 1
      `;

      request.input("menuId", sql.Int, menuId);

      if (position) {
        query += ` AND position = @position`;
        request.input("position", sql.NVarChar, position);
      }

      query += `
        ORDER BY displayOrder ASC, createdAt DESC
      `;
    }

    const result = await request.query(query);

    // Increment impression count for returned ads
    if (result.recordset.length > 0) {
      const adIds = result.recordset.map((ad: any) => ad.id);
      await pool.request().query(`
        UPDATE Ads 
        SET impressionCount = impressionCount + 1 
        WHERE id IN (${adIds.join(",")})
      `);
    }

    res.json({
      success: true,
      data: {
        ads: result.recordset,
        planType: planType, // Return plan type for frontend reference
      },
    });
  } catch (error: any) {
    console.error("Error fetching menu custom ads:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch menu ads",
      error: error.message,
    });
  }
};

/** POST /api/public/ads/:id/click — track ad click from public menu */
export async function postAdClick(
  req: Request,
  res: Response,
): Promise<void> {
  const adId = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(adId) || adId < 1) {
    res.status(400).json({ ok: false });
    return;
  }

  try {
    const recorded = await recordAdClick(adId);
    res.status(recorded ? 204 : 404).send();
  } catch {
    res.status(204).send();
  }
}

export const getHomepageFeaturedLogos = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const logos = await listHomepageFeaturedLogos();
    res.json({
      success: true,
      logos,
    });
  } catch (error: unknown) {
    console.error("Error fetching homepage featured logos:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch homepage featured logos",
    });
  }
};
