import { Request, Response } from "express";
import { getPool, sql, executeTransaction } from "../config/database";
import {
  generateUniqueSlug,
  generateUniqueMenuId,
  validateSlug,
} from "../utils/slugGenerator";
import { logger } from "../utils/logger";
import { normalizeMenuTableRow } from "../utils/normalizeMenuTableRow";
import { isUserOnFreePlan } from "../services/subscriptionPlan.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { ROLES } from "../config/constants";
import {
  getMenuStaffColumnMeta,
  normalizeStaffRow,
} from "../config/menuStaffColumns";
import { logMenuActivitySafe } from "../services/menuActivityLog.service";

// Get user's menus
export async function getUserMenus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { locale = "ar" } = req.query;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("userId", sql.Int, userId).query(`
        SELECT 
          m.id, m.userId, m.slug, m.logo, m.theme, m.isActive, m.createdAt, m.updatedAt,
          mtAr.name as nameAr, 
          mtAr.description as descriptionAr,
          mtEn.name as nameEn,
          mtEn.description as descriptionEn
        FROM Menus m
        LEFT JOIN MenuTranslations mtAr ON m.id = mtAr.menuId AND mtAr.locale = 'ar'
        LEFT JOIN MenuTranslations mtEn ON m.id = mtEn.menuId AND mtEn.locale = 'en'
        WHERE m.userId = @userId
        ORDER BY m.createdAt DESC
      `);

    res.json({ menus: result.recordset });
  } catch (error) {
    logger.error("Get user menus error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetMenus);
  }
}

// Create menu
export async function createMenu(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const {
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      slug: customSlug,
      logo,
      theme = "default",
      currency = "SAR",
    } = req.body;

    // Validate required fields
    if (!nameAr || !nameEn) {
      sendApiError(res, req, 400, ApiErrors.nameRequiredArEn);
      return;
    }

    if (!logo || typeof logo !== "string" || !logo.trim()) {
      sendApiError(res, req, 400, ApiErrors.logoRequired);
      return;
    }

    // Generate unique slug from custom slug or Arabic name
    const slug = customSlug
      ? await generateUniqueSlug(customSlug)
      : await generateUniqueSlug(nameAr);

    // Check if menu ID is INT or NVARCHAR
    const pool = await getPool();
    const columnCheck = await pool.request().query(`
        SELECT DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Menus' AND COLUMN_NAME = 'id'
      `);

    const isIdString =
      columnCheck.recordset.length > 0 &&
      columnCheck.recordset[0].DATA_TYPE === "nvarchar";

    const menuId = await executeTransaction(async (transaction) => {
      let newMenuId: string | number;

      if (isIdString) {
        // Generate unique menu ID (7+ characters)
        newMenuId = await generateUniqueMenuId(7);

        // Insert menu with generated ID
        await transaction
          .request()
          .input("id", sql.NVarChar, newMenuId)
          .input("userId", sql.Int, userId)
          .input("slug", sql.NVarChar, slug)
          .input("logo", sql.NVarChar, logo || null)
          .input("theme", sql.NVarChar, theme)
          .input("currency", sql.NVarChar(3), currency).query(`
            INSERT INTO Menus (id, userId, slug, logo, theme, currency)
            VALUES (@id, @userId, @slug, @logo, @theme, @currency)
          `);
      } else {
        // Use IDENTITY (INT)
        const menuResult = await transaction
          .request()
          .input("userId", sql.Int, userId)
          .input("slug", sql.NVarChar, slug)
          .input("logo", sql.NVarChar, logo || null)
          .input("theme", sql.NVarChar, theme)
          .input("currency", sql.NVarChar(3), currency).query(`
            INSERT INTO Menus (userId, slug, logo, theme, currency)
            OUTPUT INSERTED.id
            VALUES (@userId, @slug, @logo, @theme, @currency)
          `);

        newMenuId = menuResult.recordset[0].id;
      }

      // Insert Arabic translation
      const arRequest = transaction.request();
      if (isIdString) {
        arRequest.input("menuId", sql.NVarChar, newMenuId);
      } else {
        arRequest.input("menuId", sql.Int, newMenuId);
      }

      await arRequest
        .input("locale", sql.NVarChar, "ar")
        .input("name", sql.NVarChar, nameAr)
        .input("description", sql.NVarChar, descriptionAr || null).query(`
          INSERT INTO MenuTranslations (menuId, locale, name, description)
          VALUES (@menuId, @locale, @name, @description)
        `);

      // Insert English translation
      const enRequest = transaction.request();
      if (isIdString) {
        enRequest.input("menuId", sql.NVarChar, newMenuId);
      } else {
        enRequest.input("menuId", sql.Int, newMenuId);
      }

      await enRequest
        .input("locale", sql.NVarChar, "en")
        .input("name", sql.NVarChar, nameEn)
        .input("description", sql.NVarChar, descriptionEn || null).query(`
          INSERT INTO MenuTranslations (menuId, locale, name, description)
          VALUES (@menuId, @locale, @name, @description)
        `);

      return newMenuId;
    });

    res.status(201).json({
      message: "Menu created successfully",
      menuId,
      slug,
    });
  } catch (error) {
    logger.error("Create menu error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateMenu);
  }
}

// Get menu by ID
export async function getMenuById(req: Request, res: Response): Promise<void> {
  try {
    const auth = req.user!;
    const userId = auth.userId;
    const { id } = req.params;
    const menuIdNum = parseInt(id);
    const isStaff = auth.role === ROLES.STAFF;

    const pool = await getPool();

    let result;

    if (isStaff) {
      result = await pool
        .request()
        .input("id", sql.Int, menuIdNum)
        .input("staffId", sql.Int, userId)
        .query(`
        SELECT 
          m.id, m.userId, m.slug, m.logo, m.theme, m.isActive, m.createdAt,
          ISNULL(m.currency, 'SAR') as currency,
          m.footerLogo, m.footerDescriptionEn, m.footerDescriptionAr,
          m.socialFacebook, m.socialInstagram, m.socialTwitter, m.socialWhatsapp,
          m.addressEn, m.addressAr, m.phone, m.workingHours,
          ar.name as nameAr, ar.description as descriptionAr,
          en.name as nameEn, en.description as descriptionEn
        FROM Menus m
        INNER JOIN MenuStaff s ON s.menuId = m.id AND s.id = @staffId
        LEFT JOIN MenuTranslations ar ON m.id = ar.menuId AND ar.locale = 'ar'
        LEFT JOIN MenuTranslations en ON m.id = en.menuId AND en.locale = 'en'
        WHERE m.id = @id
          AND LOWER(LTRIM(RTRIM(ISNULL(s.role, '')))) IN ('cashier', 'casher')
      `);
    } else {
      result = await pool
        .request()
        .input("id", sql.Int, menuIdNum)
        .input("userId", sql.Int, userId)
        .query(`
        SELECT 
          m.id, m.userId, m.slug, m.logo, m.theme, m.isActive, m.createdAt,
          ISNULL(m.currency, 'SAR') as currency,
          m.footerLogo, m.footerDescriptionEn, m.footerDescriptionAr,
          m.socialFacebook, m.socialInstagram, m.socialTwitter, m.socialWhatsapp,
          m.addressEn, m.addressAr, m.phone, m.workingHours,
          ar.name as nameAr, ar.description as descriptionAr,
          en.name as nameEn, en.description as descriptionEn
        FROM Menus m
        LEFT JOIN MenuTranslations ar ON m.id = ar.menuId AND ar.locale = 'ar'
        LEFT JOIN MenuTranslations en ON m.id = en.menuId AND en.locale = 'en'
        WHERE m.id = @id AND m.userId = @userId
      `);
    }

    if (result.recordset.length === 0) {
      if (isStaff) {
        sendApiError(res, req, 403, ApiErrors.staffCashierRequired);
        return;
      }
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    let menu = result.recordset[0];

    // Parse workingHours if it's a JSON string
    if (menu.workingHours && typeof menu.workingHours === 'string') {
      try {
        menu.workingHours = JSON.parse(menu.workingHours);
      } catch (e) {
        // If parsing fails, set to null
        menu.workingHours = null;
      }
    }

    // Get statistics for the menu
    const statsResult = await pool
      .request()
      .input("menuId", sql.Int, menuIdNum).query(`
        SELECT 
          (SELECT COUNT(*) FROM MenuItems WHERE menuId = @menuId) as totalItems,
          (SELECT COUNT(*) FROM MenuItems WHERE menuId = @menuId AND available = 1) as activeItems,
          (SELECT COUNT(*) FROM Categories WHERE menuId = @menuId) as categories,
          (SELECT COUNT(*) FROM MenuStaff WHERE menuId = @menuId) as staffCount,
          (SELECT COUNT(*) FROM MenuTables WHERE menuId = @menuId) as tablesCount
      `);

    const stats = statsResult.recordset[0];

    const viewsResult = await pool
      .request()
      .input("menuId", sql.Int, menuIdNum)
      .query(`
        SELECT
          ISNULL(viewCount, 0) AS viewCount,
          ISNULL(qrScanCount, 0) AS qrScanCount
        FROM Menus WHERE id = @menuId
      `);
    const menuViews = Number(viewsResult.recordset[0]?.viewCount ?? 0);
    const menuQrScans = Number(viewsResult.recordset[0]?.qrScanCount ?? 0);

    const ownerUserId = menu.userId as number;
    const freeUser = await isUserOnFreePlan(ownerUserId);

    // Staff & tables are Pro-only — omit lists and counts for Free (dashboard)
    if (freeUser) {
      res.json({
        menu: menu,
        itemsCount: stats.totalItems || 0,
        activeItemsCount: stats.activeItems || 0,
        categoriesCount: stats.categories || 0,
        staffCount: 0,
        tablesCount: 0,
        menuStaff: [],
        menuTables: [],
        views: menuViews,
        qrScans: menuQrScans,
      });
      return;
    }

    // Get staff & tables lists (staff rows normalized like GET /menus/:menuId/staff — no password hash)
    const staffMeta = await getMenuStaffColumnMeta();
    const [staffResult, tablesResult] = await Promise.all([
      pool.request().input("menuId", sql.Int, menuIdNum).query(`
        SELECT * FROM MenuStaff WHERE menuId = @menuId ORDER BY id DESC
      `),
      pool.request().input("menuId", sql.Int, menuIdNum).query(`
        SELECT * FROM MenuTables WHERE menuId = @menuId ORDER BY id DESC
      `),
    ]);

    const menuStaffNormalized = (
      staffResult.recordset as Record<string, unknown>[]
    ).map((row) => normalizeStaffRow(row, staffMeta));

    res.json({
      menu: menu,
      itemsCount: stats.totalItems || 0,
      activeItemsCount: stats.activeItems || 0,
      categoriesCount: stats.categories || 0,
      staffCount: stats.staffCount || 0,
      tablesCount: stats.tablesCount || 0,
      menuStaff: menuStaffNormalized,
      menuTables: (tablesResult.recordset as Record<string, unknown>[]).map(
        (row) => normalizeMenuTableRow(row),
      ),
      views: menuViews,
      qrScans: menuQrScans,
    });
  } catch (error) {
    logger.error("Get menu by ID error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetMenu);
  }
}

// Update menu
export async function updateMenu(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role === ROLES.STAFF) {
      sendApiError(res, req, 403, {
        en: "Only the menu owner can update menu settings.",
        ar: "يستطيع مالك القائمة فقط تعديل الإعدادات.",
      });
      return;
    }

    const userId = req.user!.userId;
    const { id } = req.params;
    const menuId = parseInt(id);
    const {
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      logo,
      theme,
      currency,
      isActive,
      footerLogo,
      footerDescriptionEn,
      footerDescriptionAr,
      socialFacebook,
      socialInstagram,
      socialTwitter,
      socialWhatsapp,
      addressEn,
      addressAr,
      phone,
      workingHours,
    } = req.body;

    const touched: string[] = [];
    await executeTransaction(async (transaction) => {
      // Verify ownership
      const checkResult = await transaction
        .request()
        .input("id", sql.Int, menuId)
        .input("userId", sql.Int, userId)
        .query("SELECT id FROM Menus WHERE id = @id AND userId = @userId");

      if (checkResult.recordset.length === 0) {
        throw new Error("Menu not found or access denied");
      }

      // Update menu table fields individually
      const menuUpdates: string[] = [];
      const menuRequest = transaction
        .request()
        .input("id", sql.Int, menuId);

      if (logo !== undefined) {
        touched.push("logo");
        menuUpdates.push("logo = @logo");
        menuRequest.input("logo", sql.NVarChar, logo || null);
      }

      if (theme !== undefined) {
        touched.push("theme");
        menuUpdates.push("theme = @theme");
        menuRequest.input("theme", sql.NVarChar, theme);
      }

      if (currency !== undefined) {
        touched.push("currency");
        menuUpdates.push("currency = @currency");
        menuRequest.input("currency", sql.NVarChar(3), currency);
      }

      if (isActive !== undefined) {
        touched.push("isActive");
        menuUpdates.push("isActive = @isActive");
        menuRequest.input("isActive", sql.Bit, isActive ? 1 : 0);
      }

      if (footerLogo !== undefined) {
        touched.push("footerLogo");
        menuUpdates.push("footerLogo = @footerLogo");
        menuRequest.input("footerLogo", sql.NVarChar, footerLogo || null);
      }

      if (footerDescriptionEn !== undefined) {
        touched.push("footerDescriptionEn");
        menuUpdates.push("footerDescriptionEn = @footerDescriptionEn");
        menuRequest.input(
          "footerDescriptionEn",
          sql.NVarChar,
          footerDescriptionEn || null
        );
      }

      if (footerDescriptionAr !== undefined) {
        touched.push("footerDescriptionAr");
        menuUpdates.push("footerDescriptionAr = @footerDescriptionAr");
        menuRequest.input(
          "footerDescriptionAr",
          sql.NVarChar,
          footerDescriptionAr || null
        );
      }

      if (socialFacebook !== undefined) {
        touched.push("socialFacebook");
        menuUpdates.push("socialFacebook = @socialFacebook");
        menuRequest.input(
          "socialFacebook",
          sql.NVarChar,
          socialFacebook || null
        );
      }

      if (socialInstagram !== undefined) {
        touched.push("socialInstagram");
        menuUpdates.push("socialInstagram = @socialInstagram");
        menuRequest.input(
          "socialInstagram",
          sql.NVarChar,
          socialInstagram || null
        );
      }

      if (socialTwitter !== undefined) {
        touched.push("socialTwitter");
        menuUpdates.push("socialTwitter = @socialTwitter");
        menuRequest.input("socialTwitter", sql.NVarChar, socialTwitter || null);
      }

      if (socialWhatsapp !== undefined) {
        touched.push("socialWhatsapp");
        menuUpdates.push("socialWhatsapp = @socialWhatsapp");
        menuRequest.input(
          "socialWhatsapp",
          sql.NVarChar,
          socialWhatsapp || null
        );
      }

      if (addressEn !== undefined) {
        touched.push("addressEn");
        menuUpdates.push("addressEn = @addressEn");
        menuRequest.input("addressEn", sql.NVarChar, addressEn || null);
      }

      if (addressAr !== undefined) {
        touched.push("addressAr");
        menuUpdates.push("addressAr = @addressAr");
        menuRequest.input("addressAr", sql.NVarChar, addressAr || null);
      }

      if (phone !== undefined) {
        touched.push("phone");
        menuUpdates.push("phone = @phone");
        menuRequest.input("phone", sql.NVarChar, phone || null);
      }

      if (workingHours !== undefined) {
        touched.push("workingHours");
        menuUpdates.push("workingHours = @workingHours");
        menuRequest.input(
          "workingHours",
          sql.NVarChar(sql.MAX),
          workingHours ? JSON.stringify(workingHours) : null
        );
      }

      if (menuUpdates.length > 0) {
        await menuRequest.query(`
          UPDATE Menus 
          SET ${menuUpdates.join(", ")}, updatedAt = GETDATE()
          WHERE id = @id
        `);
      }

      // Update Arabic translations individually
      if (nameAr !== undefined || descriptionAr !== undefined) {
        const arUpdates: string[] = [];
        const arRequest = transaction
          .request()
          .input("menuId", sql.Int, menuId);

        if (nameAr !== undefined) {
          touched.push("nameAr");
          arUpdates.push("name = @name");
          arRequest.input("name", sql.NVarChar, nameAr);
        }

        if (descriptionAr !== undefined) {
          touched.push("descriptionAr");
          arUpdates.push("description = @description");
          arRequest.input("description", sql.NVarChar, descriptionAr || null);
        }

        if (arUpdates.length > 0) {
          await arRequest.query(`
            UPDATE MenuTranslations
            SET ${arUpdates.join(", ")}
            WHERE menuId = @menuId AND locale = 'ar'
          `);
        }
      }

      // Update English translations individually
      if (nameEn !== undefined || descriptionEn !== undefined) {
        const enUpdates: string[] = [];
        const enRequest = transaction
          .request()
          .input("menuId", sql.Int, menuId);

        if (nameEn !== undefined) {
          touched.push("nameEn");
          enUpdates.push("name = @name");
          enRequest.input("name", sql.NVarChar, nameEn);
        }

        if (descriptionEn !== undefined) {
          touched.push("descriptionEn");
          enUpdates.push("description = @description");
          enRequest.input("description", sql.NVarChar, descriptionEn || null);
        }

        if (enUpdates.length > 0) {
          await enRequest.query(`
            UPDATE MenuTranslations
            SET ${enUpdates.join(", ")}
            WHERE menuId = @menuId AND locale = 'en'
          `);
        }
      }
    });

    res.json({ message: "Menu updated successfully" });
    if (touched.length > 0) {
      void logMenuActivitySafe(req, menuId, {
        action: "MENU_SETTINGS_UPDATED",
        targetType: "menu",
        targetId: menuId,
        summaryAr: "تحديث إعدادات القائمة",
        summaryEn: "Menu settings updated",
        detailJson: JSON.stringify({ fields: touched }),
      });
    }
  } catch (error) {
    logger.error("Update menu error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateMenu);
  }
}

// Toggle menu status
export async function toggleMenuStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (req.user?.role === ROLES.STAFF) {
      sendApiError(res, req, 403, {
        en: "Only the menu owner can change menu status.",
        ar: "يستطيع مالك القائمة فقط تغيير حالة القائمة.",
      });
      return;
    }

    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { id } = req.params;
    const { isActive } = req.body;

    // Validate isActive value
    if (typeof isActive !== "boolean") {
      sendApiError(res, req, 400, ApiErrors.isActiveMustBeBoolean);
      return;
    }

    const pool = await getPool();

    // Admin can update any menu, regular users can only update their own
    let query;
    if (userRole === "admin") {
      query = `
        UPDATE Menus
        SET isActive = @isActive
        WHERE id = @id
      `;
    } else {
      query = `
        UPDATE Menus
        SET isActive = @isActive
        WHERE id = @id AND userId = @userId
      `;
    }

    // Update without OUTPUT (because of triggers)
    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .input("userId", sql.Int, userId)
      .input("isActive", sql.Bit, isActive)
      .query(query);

    if (result.rowsAffected[0] === 0) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    res.json({
      message: "Menu status updated",
      isActive: isActive, // Return the value we just set
    });
  } catch (error) {
    logger.error("Toggle menu status error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateMenuStatus);
  }
}

// Delete menu
export async function deleteMenu(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role === ROLES.STAFF) {
      sendApiError(res, req, 403, {
        en: "Only the menu owner can delete this menu.",
        ar: "يستطيع مالك القائمة فقط حذفها.",
      });
      return;
    }

    const userId = req.user!.userId;
    const { id } = req.params;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .input("userId", sql.Int, userId)
      .query("DELETE FROM Menus WHERE id = @id AND userId = @userId");

    if (result.rowsAffected[0] === 0) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    res.json({ message: "Menu deleted successfully" });
  } catch (error) {
    logger.error("Delete menu error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteMenu);
  }
}

// Check slug availability and get similar suggestions
export async function checkSlugAvailability(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { slug } = req.query;

    if (!slug || typeof slug !== "string") {
      sendApiError(res, req, 400, ApiErrors.slugRequired);
      return;
    }

    const normalizedSlug = slug.toLowerCase().trim();

    // Validate slug format
    if (!validateSlug(normalizedSlug)) {
      sendApiError(res, req, 400, ApiErrors.invalidSlugFormat, {
        available: false,
      });
      return;
    }

    const pool = await getPool();

    // Check if slug exists
    const checkResult = await pool
      .request()
      .input("slug", sql.NVarChar, normalizedSlug)
      .query("SELECT COUNT(*) as count FROM Menus WHERE slug = @slug");

    const exists = checkResult.recordset[0].count > 0;

    // If slug exists, find similar slugs
    let suggestions: string[] = [];
    if (exists) {
      const similarResult = await pool
        .request()
        .input("slug", sql.NVarChar, `${normalizedSlug}%`).query(`
          SELECT TOP 5 slug 
          FROM Menus 
          WHERE slug LIKE @slug 
          ORDER BY slug
        `);

      suggestions = similarResult.recordset.map((row: any) => row.slug);

      // Generate alternative suggestions
      const alternatives: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const altSlug = `${normalizedSlug}-${i}`;
        const altCheck = await pool
          .request()
          .input("altSlug", sql.NVarChar, altSlug)
          .query("SELECT COUNT(*) as count FROM Menus WHERE slug = @altSlug");

        if (altCheck.recordset[0].count === 0) {
          alternatives.push(altSlug);
        }
      }

      suggestions = [...alternatives, ...suggestions].slice(0, 5);
    }

    res.json({
      available: !exists,
      slug: normalizedSlug,
      suggestions: exists ? suggestions : [],
    });
  } catch (error) {
    logger.error("Check slug availability error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCheckSlugAvailability);
  }
}
