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
import { getImageUrl } from "../utils/urlHelper";
import { attachParsedMenuItemOptionsList } from "../utils/menuItemVariants";
import { ensureDeliverySchema } from "../schemas/delivery.schema";
import { ensureMenuChatbotSchema } from "../schemas/menuChatbot.schema";
import { normalizeChatbotEnabled } from "../utils/normalizeChatbotEnabled";
import { normalizeMenuTheme } from "../constants/menuThemes";
import { fetchMenuDeliverySettings } from "../services/menuDelivery.service";
import {
  findNearestBranchMenu,
  MIN_BRANCH_REDIRECT_IMPROVEMENT_KM,
} from "../services/menuGeoRedirect.service";

export type PublicDeliverySettings = {
  deliveryOn: boolean;
  deliveryPhone: string | null;
  phoneNumber: string | null;
  deliveryWhatsAppOn: boolean;
  governorates: Record<string, unknown>[];
};

async function fetchPublicDeliveryForMenu(
  menuId: number,
): Promise<PublicDeliverySettings> {
  return fetchMenuDeliverySettings(menuId);
}

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

const PUBLIC_MENU_INITIAL_ITEMS_LIMIT = 30;
const CATALOG_PAGE_SIZE = 30;

function buildMenuItemsOrderClause(
  hasCategoryId: boolean,
  hasCategoriesTable: boolean,
  withinCategoryOnly: boolean,
): string {
  const itemOrder = "mi.sortOrder ASC, mi.createdAt DESC, mi.id ASC";
  if (withinCategoryOnly) {
    return itemOrder;
  }
  if (!hasCategoryId) {
    return `mi.category ASC, ${itemOrder}`;
  }
  if (hasCategoriesTable) {
    return `CASE WHEN mi.categoryId IS NULL OR c.id IS NULL THEN 1 ELSE 0 END ASC, c.sortOrder ASC, c.createdAt DESC, ${itemOrder}`;
  }
  return `mi.categoryId ASC, ${itemOrder}`;
}

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

    await ensureMenuChatbotSchema();

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
          ISNULL(m.chatbotEnabled, 1) as chatbotEnabled,
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
    const delivery = await fetchPublicDeliveryForMenu(menu.id);

    // إذا كانت القائمة غير نشطة، أرسل بيانات محدودة لصفحة الصيانة فقط
    if (!menu.isActive) {
      const tables = await fetchPublicMenuTablesForMenu(pool, menu.id);
      const table = resolvePublicMenuTable(tables, { tableNumber, tableId });
      res.setHeader("Content-Language", locale);
      return res.json({
        success: true,
        data: {
          locale,
          delivery,
          menu: {
            id: menu.id,
            name: menu.name,
            description: menu.description,
            logo: getImageUrl(menu.logo),
            theme: normalizeMenuTheme(menu.theme),
            currency: menu.currency || "SAR",
            slug: menu.slug,
            isActive: menu.isActive,
            chatbotEnabled: normalizeChatbotEnabled(menu.chatbotEnabled),
            locale: menu.locale,
            ownerPlanType: menu.ownerPlanType || "free",
            footerLogo: getImageUrl(menu.footerLogo),
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
          totalItems: 0,
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
        AND COLUMN_NAME IN ('categoryId', 'originalPrice', 'discountPercent', 'sizes', 'variants')
      `);

    const existingColumns = columnCheck.recordset.map(
      (r: any) => r.COLUMN_NAME,
    );
    const hasCategoryId = existingColumns.includes("categoryId");
    const hasOriginalPrice = existingColumns.includes("originalPrice");
    const hasDiscountPercent = existingColumns.includes("discountPercent");
    const hasSizes = existingColumns.includes("sizes");
    const hasVariants = existingColumns.includes("variants");

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
    if (hasSizes) {
      selectFields.push("mi.sizes");
    }
    if (hasVariants) {
      selectFields.push("mi.variants");
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

    const itemsOrderClause = buildMenuItemsOrderClause(
      hasCategoryId,
      hasCategoriesTable,
      false,
    );

    const itemsQuery = `
      SELECT 
        ${selectFields.join(",\n        ")}
      FROM MenuItems mi
      ${joinClause}
      WHERE mi.menuId = @menuId AND mi.available = 1
      ORDER BY ${itemsOrderClause}
      OFFSET 0 ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    const itemsResult = await pool
      .request()
      .input("menuId", sql.Int, menu.id)
      .input("locale", sql.NVarChar, locale)
      .input("limit", sql.Int, PUBLIC_MENU_INITIAL_ITEMS_LIMIT)
      .query(itemsQuery);

    const countResult = await pool
      .request()
      .input("menuId", sql.Int, menu.id).query(`
        SELECT COUNT(*) as total
        FROM MenuItems mi
        WHERE mi.menuId = @menuId AND mi.available = 1
      `);
    const totalItems = Number(countResult.recordset[0]?.total ?? 0);

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

    const normalizedItems = attachParsedMenuItemOptionsList(
      itemsResult.recordset.map((item: { image?: string | null }) => ({
        ...item,
        image: getImageUrl(item.image),
      })),
    );

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
      const menuAdsResult = await pool
        .request()
        .input("menuId", sql.Int, menu.id).query(`
          SELECT TOP (1)
            id, title, titleAr, content, contentAr, imageUrl, linkUrl,
            position, displayOrder
          FROM Ads
          WHERE menuId = @menuId AND adType = 'menu' AND isActive = 1
          ORDER BY displayOrder ASC, createdAt DESC
        `);
      ads = menuAdsResult.recordset;

      if (ads.length === 0) {
        const globalAdsResult = await pool.request().query(`
          SELECT TOP (10)
            id, title, titleAr, content, contentAr, imageUrl, linkUrl,
            position, displayOrder
          FROM Ads
          WHERE adType = 'global' AND isActive = 1
          ORDER BY displayOrder ASC, createdAt DESC
        `);
        ads = globalAdsResult.recordset;
      }
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

    const normalizedCategories = categories.map((category) => ({
      ...category,
      image: getImageUrl(category.image),
    }));
    const normalizedAds = ads.map((ad: { imageUrl?: string | null }) => ({
      ...ad,
      imageUrl: getImageUrl(ad.imageUrl),
    }));

    res.json({
      success: true,
      data: {
        locale,
        delivery,
        menu: {
          id: menu.id,
          name: menu.name,
          description: menu.description,
          logo: getImageUrl(menu.logo),
          theme: normalizeMenuTheme(menu.theme),
          currency: menu.currency || "SAR",
          slug: menu.slug,
          isActive: menu.isActive,
          chatbotEnabled: normalizeChatbotEnabled(menu.chatbotEnabled),
          locale: menu.locale,
          ownerPlanType: menu.ownerPlanType || "free", // Add owner's plan type
          footerLogo: getImageUrl(menu.footerLogo),
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
        categories: normalizedCategories,
        items: normalizedItems,
        totalItems,
        branches: branchesResult.recordset,
        rating: {
          average: rating.averageRating
            ? parseFloat(rating.averageRating.toFixed(1))
            : 0,
          total: rating.totalRatings,
        },
        ads: normalizedAds,
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
      .input("itemId", sql.Int, itemId).query(`
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

    // If free plan, show custom menu ad (max 1) or fall back to global ads
    if (planType === "free") {
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

      const menuAdsResult = await request.query(query);

      if (menuAdsResult.recordset.length === 0) {
        query = `
          SELECT TOP (@limit)
            id, title, titleAr, content, contentAr, imageUrl, linkUrl,
            position, displayOrder
          FROM Ads
          WHERE adType = 'global' AND isActive = 1
        `;
        request = pool.request().input("limit", sql.Int, limit);

        if (position) {
          query += ` AND position = @position`;
          request.input("position", sql.NVarChar, position);
        }

        query += `
          ORDER BY displayOrder ASC, createdAt DESC
        `;
      }
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
        ads: result.recordset.map((ad: { imageUrl?: string | null }) => ({
          ...ad,
          imageUrl: getImageUrl(ad.imageUrl),
        })),
        planType: planType,
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
export async function postAdClick(req: Request, res: Response): Promise<void> {
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
const DEFAULT_CATALOG_PAGE_LIMIT = CATALOG_PAGE_SIZE;
const MAX_CATALOG_PAGE_LIMIT = CATALOG_PAGE_SIZE;

/**
 * GET /api/public/menu/:slug/catalog
 * All active categories + paginated products for a menu (public).
 * Query: page, limit|pageSize (max 30), categoryId (optional filter), locale.
 * Products are ordered by category sortOrder, then item sortOrder.
 */
export const getPublicMenuCatalog = async (req: Request, res: Response) => {
  try {
    const slug = decodeURIComponent(String(req.params.slug ?? "")).trim();
    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Menu slug is required",
      });
    }

    const locale =
      (req.query.locale as string) === "ar"
        ? "ar"
        : (req.query.locale as string) === "en"
          ? "en"
          : getLocaleFromAcceptLanguage(req, "ar");

    const pageNum = Math.max(
      1,
      parseInt(String(req.query.page ?? "1"), 10) || 1,
    );
    const limitNum = Math.min(
      MAX_CATALOG_PAGE_LIMIT,
      Math.max(
        1,
        parseInt(
          String(
            req.query.limit ?? req.query.pageSize ?? DEFAULT_CATALOG_PAGE_LIMIT,
          ),
          10,
        ) || DEFAULT_CATALOG_PAGE_LIMIT,
      ),
    );
    const offset = (pageNum - 1) * limitNum;

    const categoryIdRaw = req.query.categoryId;
    const categoryId =
      categoryIdRaw !== undefined && categoryIdRaw !== ""
        ? parseInt(String(categoryIdRaw), 10)
        : undefined;
    const hasCategoryFilter =
      categoryId !== undefined && Number.isFinite(categoryId) && categoryId > 0;

    const pool = await getPool();

    const menuResult = await pool.request().input("slug", sql.NVarChar, slug)
      .query(`
        SELECT id, ISNULL(currency, 'SAR') as currency, isActive
        FROM Menus
        WHERE slug = @slug
      `);

    if (
      menuResult.recordset.length === 0 ||
      !menuResult.recordset[0].isActive
    ) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    const menu = menuResult.recordset[0] as {
      id: number;
      currency: string;
      isActive: boolean;
    };
    const menuId = menu.id;

    const categoriesResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("locale", sql.NVarChar, locale).query(`
        SELECT
          c.id,
          c.image,
          c.sortOrder,
          ct.name,
          ctAr.name as nameAr,
          ctEn.name as nameEn,
          (SELECT COUNT(*) FROM MenuItems mi WHERE mi.categoryId = c.id AND mi.available = 1) as itemsCount
        FROM Categories c
        LEFT JOIN CategoryTranslations ct ON c.id = ct.categoryId AND ct.locale = @locale
        LEFT JOIN CategoryTranslations ctAr ON c.id = ctAr.categoryId AND ctAr.locale = 'ar'
        LEFT JOIN CategoryTranslations ctEn ON c.id = ctEn.categoryId AND ctEn.locale = 'en'
        WHERE c.menuId = @menuId AND c.isActive = 1
        ORDER BY c.sortOrder ASC, c.createdAt DESC
      `);

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
        AND COLUMN_NAME IN ('categoryId', 'originalPrice', 'discountPercent', 'sizes', 'variants')
      `);
    const existingColumns = columnCheck.recordset.map(
      (r: { COLUMN_NAME: string }) => r.COLUMN_NAME,
    );
    const hasCategoryId = existingColumns.includes("categoryId");
    const hasOriginalPrice = existingColumns.includes("originalPrice");
    const hasDiscountPercent = existingColumns.includes("discountPercent");
    const hasSizes = existingColumns.includes("sizes");
    const hasVariants = existingColumns.includes("variants");

    const productWhereParts = ["mi.menuId = @menuId", "mi.available = 1"];
    if (hasCategoryFilter && hasCategoryId) {
      productWhereParts.push("mi.categoryId = @categoryId");
    }
    const productWhereClause = `WHERE ${productWhereParts.join(" AND ")}`;

    const categoryJoin =
      hasCategoriesTable && hasCategoryId
        ? `
          LEFT JOIN Categories c ON mi.categoryId = c.id
          LEFT JOIN CategoryTranslations ct ON c.id = ct.categoryId AND ct.locale = @locale
          LEFT JOIN CategoryTranslations ctAr ON c.id = ctAr.categoryId AND ctAr.locale = 'ar'
          LEFT JOIN CategoryTranslations ctEn ON c.id = ctEn.categoryId AND ctEn.locale = 'en'`
        : "";

    const categorySelect =
      hasCategoriesTable && hasCategoryId
        ? `,
          mi.categoryId,
          ct.name as categoryName,
          ctAr.name as categoryNameAr,
          ctEn.name as categoryNameEn`
        : "";

    const optionSelectParts: string[] = [];
    if (hasOriginalPrice) optionSelectParts.push("mi.originalPrice");
    if (hasDiscountPercent) optionSelectParts.push("mi.discountPercent");
    if (hasSizes) optionSelectParts.push("mi.sizes");
    if (hasVariants) optionSelectParts.push("mi.variants");
    const optionSelect =
      optionSelectParts.length > 0 ? `,\n          ${optionSelectParts.join(",\n          ")}` : "";

    const countRequest = pool.request().input("menuId", sql.Int, menuId);
    if (hasCategoryFilter && hasCategoryId) {
      countRequest.input("categoryId", sql.Int, categoryId);
    }
    const countResult = await countRequest.query(`
        SELECT COUNT(*) as total
        FROM MenuItems mi
        ${productWhereClause}
      `);
    const totalProducts = Number(countResult.recordset[0]?.total ?? 0);

    const productsRequest = pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("locale", sql.NVarChar, locale)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, limitNum);
    if (hasCategoryFilter && hasCategoryId) {
      productsRequest.input("categoryId", sql.Int, categoryId);
    }

    const productsOrderClause = buildMenuItemsOrderClause(
      hasCategoryId,
      hasCategoriesTable,
      hasCategoryFilter,
    );

    const productsResult = await productsRequest.query(`
        SELECT
          mi.id,
          mi.price,
          mi.image,
          mi.sortOrder,
          mit.name,
          mitAr.name as nameAr,
          mitEn.name as nameEn,
          mit.description,
          mitAr.description as descriptionAr,
          mitEn.description as descriptionEn
          ${categorySelect}${optionSelect}
        FROM MenuItems mi
        LEFT JOIN MenuItemTranslations mit ON mi.id = mit.menuItemId AND mit.locale = @locale
        LEFT JOIN MenuItemTranslations mitAr ON mi.id = mitAr.menuItemId AND mitAr.locale = 'ar'
        LEFT JOIN MenuItemTranslations mitEn ON mi.id = mitEn.menuItemId AND mitEn.locale = 'en'
        ${categoryJoin}
        ${productWhereClause}
        ORDER BY ${productsOrderClause}
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);

    const categories = categoriesResult.recordset.map(
      (category: { image?: string | null }) => ({
        ...category,
        image: getImageUrl(category.image),
      }),
    );

    const products = attachParsedMenuItemOptionsList(
      productsResult.recordset.map((item: { image?: string | null }) => ({
        ...item,
        image: getImageUrl(item.image),
      })),
    );

    res.setHeader("Content-Language", locale);
    res.json({
      success: true,
      data: {
        menuId,
        slug,
        locale,
        currency: menu.currency || "SAR",
        categories,
        products,
        filters: {
          categoryId: hasCategoryFilter ? categoryId : null,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalProducts,
          totalPages: Math.ceil(totalProducts / limitNum) || 0,
        },
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching public menu catalog:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch menu catalog",
    });
  }
};

/** GET /api/public/menu/:slug/nearby-branch — closest linked branch for geo redirect. */
export async function getNearbyBranchMenu(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const slug = String(req.params.slug ?? "").trim();
    const { lat, lng } = req.query;

    if (!slug) {
      res.status(400).json({ success: false, message: "Invalid slug" });
      return;
    }

    const pool = await getPool();
    const menuResult = await pool
      .request()
      .input("slug", sql.NVarChar, slug)
      .query(`SELECT id, slug FROM Menus WHERE slug = @slug`);

    if (menuResult.recordset.length === 0) {
      res.status(404).json({ success: false, message: "Menu not found" });
      return;
    }

    const menu = menuResult.recordset[0] as { id: number; slug: string };
    const nearest = await findNearestBranchMenu(menu.id, lat, lng);

    res.json({
      success: true,
      data: {
        currentSlug: menu.slug,
        redirect: nearest
          ? {
              menuId: nearest.menuId,
              slug: nearest.slug,
              distanceKm: nearest.distanceKm,
            }
          : null,
        minImprovementKm: MIN_BRANCH_REDIRECT_IMPROVEMENT_KM,
      },
    });
  } catch (error) {
    console.error("Error resolving nearby branch menu:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resolve nearby branch",
    });
  }
};
