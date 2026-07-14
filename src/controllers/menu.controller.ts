import { Request, Response } from "express";
import { getPool, sql, executeTransaction } from "../config/database";
import {
  generateUniqueSlug,
  generateUniqueMenuId,
  validateSlug,
} from "../utils/slugGenerator";
import { logger } from "../utils/logger";
import { normalizeMenuTableRow } from "../utils/normalizeMenuTableRow";
import {
  getUserPlanCapabilities,
  isThemeAllowedForUser,
} from "../services/planCapabilities.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { MENU_APPROVAL_STATUS, ROLES } from "../config/constants";
import {
  getMenuStaffColumnMeta,
  normalizeStaffRow,
} from "../config/menuStaffColumns";
import { logMenuActivitySafe } from "../services/menuActivityLog.service";
import { generateMenuUuid } from "../utils/menuIdentifier";
import { ensureMenuChatbotSchema } from "../schemas/menuChatbot.schema";
import { ensureMenuWifiTaxServiceSchema } from "../schemas/menuWifiTaxService.schema";
import { normalizeChatbotEnabled } from "../utils/normalizeChatbotEnabled";
import {
  normalizeOptionalEnabled,
  normalizePercent,
} from "../utils/normalizeOptionalEnabled";
import { normalizeMenuTheme } from "../constants/menuThemes";
import { enforceActiveMenuLimitOnActivation } from "../middleware/planLimits";
import { ensureMenuGroupSchema } from "../schemas/menuGroup.schema";
import { ensureDeliverySchema } from "../schemas/delivery.schema";

const MENU_WIFI_TAX_SERVICE_SELECT_SQL = `
  ISNULL(m.wifiEnabled, 0) as wifiEnabled,
  m.wifiName,
  m.wifiPassword,
  ISNULL(m.taxEnabled, 0) as taxEnabled,
  m.taxPercent,
  ISNULL(m.serviceEnabled, 0) as serviceEnabled,
  m.servicePercent
`;

function attachWifiTaxServiceFields(
  menu: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...menu,
    wifiEnabled: normalizeOptionalEnabled(menu.wifiEnabled),
    wifiName: typeof menu.wifiName === "string" ? menu.wifiName : menu.wifiName ?? null,
    wifiPassword:
      typeof menu.wifiPassword === "string"
        ? menu.wifiPassword
        : menu.wifiPassword ?? null,
    taxEnabled: normalizeOptionalEnabled(menu.taxEnabled),
    taxPercent: normalizePercent(menu.taxPercent),
    serviceEnabled: normalizeOptionalEnabled(menu.serviceEnabled),
    servicePercent: normalizePercent(menu.servicePercent),
  };
}

function attachMenuGroupFields(row: Record<string, unknown>): Record<string, unknown> {
  const menuGroupIdRaw = row.menuGroupId;
  const menuGroupId =
    menuGroupIdRaw != null && menuGroupIdRaw !== ""
      ? Number(menuGroupIdRaw)
      : null;
  const groupInboxMenuIdRaw = row.groupInboxMenuId;
  const groupInboxMenuId =
    groupInboxMenuIdRaw != null && groupInboxMenuIdRaw !== ""
      ? Number(groupInboxMenuIdRaw)
      : null;
  const menuId = Number(row.id);

  return {
    ...row,
    menuGroupId:
      menuGroupId != null && Number.isFinite(menuGroupId) ? menuGroupId : null,
    menuGroupName:
      typeof row.menuGroupName === "string" ? row.menuGroupName : null,
    menuGroupMemberCount: Number(row.menuGroupMemberCount ?? 0),
    isGroupInbox:
      menuGroupId != null &&
      groupInboxMenuId != null &&
      Number.isFinite(menuId) &&
      menuId === groupInboxMenuId,
  };
}

const MENU_GROUP_JOIN_SQL = `
  LEFT JOIN MenuGroups mg ON mg.id = m.menuGroupId
`;

const MENU_GROUP_SELECT_SQL = `
  m.menuGroupId,
  mg.name AS menuGroupName,
  mg.inboxMenuId AS groupInboxMenuId,
  CASE
    WHEN m.menuGroupId IS NULL THEN 0
    ELSE (SELECT COUNT(*) FROM Menus gm WHERE gm.menuGroupId = m.menuGroupId)
  END AS menuGroupMemberCount
`;

// Get user's menus
export async function getUserMenus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { locale = "ar" } = req.query;

    const pool = await getPool();
    await ensureMenuGroupSchema();

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT 
          m.id, m.uuid, m.userId, m.slug, m.logo, m.theme, m.isActive, m.createdAt,
          ISNULL(m.chatbotEnabled, 1) as chatbotEnabled, m.updatedAt,
          mtAr.name as nameAr, 
          mtAr.description as descriptionAr,
          mtEn.name as nameEn,
          mtEn.description as descriptionEn,
          ${MENU_GROUP_SELECT_SQL}
        FROM Menus m
        ${MENU_GROUP_JOIN_SQL}
        LEFT JOIN MenuTranslations mtAr ON m.id = mtAr.menuId AND mtAr.locale = 'ar'
        LEFT JOIN MenuTranslations mtEn ON m.id = mtEn.menuId AND mtEn.locale = 'en'
        WHERE m.userId = @userId
        ORDER BY m.createdAt DESC
      `);

    res.json({
      menus: result.recordset.map((row: Record<string, unknown>) => ({
        ...attachMenuGroupFields(row),
        chatbotEnabled: normalizeChatbotEnabled(row.chatbotEnabled),
        theme: normalizeMenuTheme(row.theme as string | null),
      })),
    });
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

    await ensureMenuChatbotSchema();
    await ensureMenuGroupSchema();
    await ensureDeliverySchema();

    const columnCheck = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Menus' AND COLUMN_NAME IN ('id', 'approvalStatus')
      `);

    const menuColumns = columnCheck.recordset as {
      COLUMN_NAME: string;
      DATA_TYPE: string;
    }[];
    const idColumn = menuColumns.find((c) => c.COLUMN_NAME === "id");
    const isIdString = idColumn != null && idColumn.DATA_TYPE === "nvarchar";
    const hasApprovalStatus = menuColumns.some(
      (c) => c.COLUMN_NAME === "approvalStatus",
    );

    const newMenuUuid = generateMenuUuid();

    const menuId = await executeTransaction(async (transaction) => {
      let newMenuId: string | number;

      if (isIdString) {
        // Generate unique menu ID (7+ characters)
        newMenuId = await generateUniqueMenuId(7);

        const insertCols = hasApprovalStatus
          ? `id, uuid, userId, slug, logo, theme, currency, approvalStatus`
          : `id, uuid, userId, slug, logo, theme, currency`;
        const insertVals = hasApprovalStatus
          ? `@id, @uuid, @userId, @slug, @logo, @theme, @currency, @approvalStatus`
          : `@id, @uuid, @userId, @slug, @logo, @theme, @currency`;

        const insertRequest = transaction
          .request()
          .input("id", sql.NVarChar, newMenuId)
          .input("uuid", sql.UniqueIdentifier, newMenuUuid)
          .input("userId", sql.Int, userId)
          .input("slug", sql.NVarChar, slug)
          .input("logo", sql.NVarChar, logo || null)
          .input("theme", sql.NVarChar, theme)
          .input("currency", sql.NVarChar(3), currency);

        if (hasApprovalStatus) {
          insertRequest.input(
            "approvalStatus",
            sql.NVarChar(20),
            MENU_APPROVAL_STATUS.ACTIVE,
          );
        }

        await insertRequest.query(`
            INSERT INTO Menus (${insertCols})
            VALUES (${insertVals})
          `);
      } else {
        // Use IDENTITY (INT)
        const insertCols = hasApprovalStatus
          ? `uuid, userId, slug, logo, theme, currency, approvalStatus`
          : `uuid, userId, slug, logo, theme, currency`;
        const insertVals = hasApprovalStatus
          ? `@uuid, @userId, @slug, @logo, @theme, @currency, @approvalStatus`
          : `@uuid, @userId, @slug, @logo, @theme, @currency`;

        const insertRequest = transaction
          .request()
          .input("uuid", sql.UniqueIdentifier, newMenuUuid)
          .input("userId", sql.Int, userId)
          .input("slug", sql.NVarChar, slug)
          .input("logo", sql.NVarChar, logo || null)
          .input("theme", sql.NVarChar, theme)
          .input("currency", sql.NVarChar(3), currency);

        if (hasApprovalStatus) {
          insertRequest.input(
            "approvalStatus",
            sql.NVarChar(20),
            MENU_APPROVAL_STATUS.ACTIVE,
          );
        }

        const menuResult = await insertRequest.query(`
            INSERT INTO Menus (${insertCols})
            OUTPUT INSERTED.id
            VALUES (${insertVals})
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

      const seedRequest = transaction.request();
      if (isIdString) {
        seedRequest.input("menuId", sql.NVarChar, newMenuId);
      } else {
        seedRequest.input("menuId", sql.Int, newMenuId);
      }
      await seedRequest.query(`
        UPDATE Menus SET deliveryLegacyUserSeedDone = 1 WHERE id = @menuId
      `);

      return newMenuId;
    });

    res.status(201).json({
      message: "Menu created successfully",
      menuId,
      uuid: newMenuUuid,
      slug,
    });
  } catch (error) {
    logger.error("Create menu error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateMenu);
  }
}

/**
 * Copy menu shape & settings into a new menu. Body requires `slug`, `nameAr`, `nameEn`.
 * Copies: theme, branding, wifi/tax/service, social, hours,
 * delivery flags/phone/mode, customizations, and delivery zones.
 * Descriptions are copied from the source; names come from the request.
 * Does not copy categories, items, staff, tables, ads, or group membership.
 */
export async function copyMenu(req: Request, res: Response): Promise<void> {
  try {
    if (req.user?.role === ROLES.STAFF) {
      sendApiError(res, req, 403, {
        en: "Only the menu owner can copy this menu.",
        ar: "يستطيع مالك القائمة فقط نسخها.",
      });
      return;
    }

    const userId = req.user!.userId;
    const sourceMenuId = parseInt(req.params.menuId, 10);
    const rawSlug = req.body?.slug;
    const rawNameAr = req.body?.nameAr;
    const rawNameEn = req.body?.nameEn;

    const nameAr =
      typeof rawNameAr === "string" ? rawNameAr.trim() : "";
    const nameEn =
      typeof rawNameEn === "string" ? rawNameEn.trim() : "";

    if (!nameAr || !nameEn) {
      sendApiError(res, req, 400, ApiErrors.nameRequiredArEn);
      return;
    }

    if (!rawSlug || typeof rawSlug !== "string") {
      sendApiError(res, req, 400, ApiErrors.slugRequired);
      return;
    }

    const slug = rawSlug.toLowerCase().trim();
    if (!validateSlug(slug)) {
      sendApiError(res, req, 400, ApiErrors.invalidSlugFormat);
      return;
    }

    await ensureMenuChatbotSchema();
    await ensureMenuWifiTaxServiceSchema();
    await ensureMenuGroupSchema();
    await ensureDeliverySchema();

    const pool = await getPool();

    const slugCheck = await pool
      .request()
      .input("slug", sql.NVarChar, slug)
      .query("SELECT COUNT(*) as count FROM Menus WHERE slug = @slug");

    if (Number(slugCheck.recordset[0]?.count ?? 0) > 0) {
      sendApiError(res, req, 409, ApiErrors.slugAlreadyTaken, {
        available: false,
      });
      return;
    }

    const sourceResult = await pool
      .request()
      .input("id", sql.Int, sourceMenuId)
      .input("userId", sql.Int, userId).query(`
        SELECT
          m.id, m.logo, m.theme, ISNULL(m.currency, 'SAR') as currency,
          ISNULL(m.chatbotEnabled, 1) as chatbotEnabled,
          ISNULL(m.wifiEnabled, 0) as wifiEnabled,
          m.wifiName, m.wifiPassword,
          ISNULL(m.taxEnabled, 0) as taxEnabled, m.taxPercent,
          ISNULL(m.serviceEnabled, 0) as serviceEnabled, m.servicePercent,
          m.footerLogo, m.footerDescriptionEn, m.footerDescriptionAr,
          m.socialFacebook, m.socialInstagram, m.socialTwitter, m.socialWhatsapp,
          m.addressEn, m.addressAr, m.phone, m.workingHours,
          ISNULL(m.deliveryOn, 0) as deliveryOn,
          m.deliveryPhone,
          ISNULL(m.deliveryWhatsAppOn, 1) as deliveryWhatsAppOn,
          ISNULL(m.deliveryMode, N'governorates') as deliveryMode,
          ar.name as nameAr, ar.description as descriptionAr,
          en.name as nameEn, en.description as descriptionEn
        FROM Menus m
        LEFT JOIN MenuTranslations ar ON m.id = ar.menuId AND ar.locale = 'ar'
        LEFT JOIN MenuTranslations en ON m.id = en.menuId AND en.locale = 'en'
        WHERE m.id = @id AND m.userId = @userId
      `);

    if (sourceResult.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const source = sourceResult.recordset[0] as Record<string, unknown>;
    const logo =
      typeof source.logo === "string" && source.logo.trim()
        ? source.logo.trim()
        : null;

    if (!logo) {
      sendApiError(res, req, 400, ApiErrors.logoRequired);
      return;
    }

    const descriptionAr =
      typeof source.descriptionAr === "string" ? source.descriptionAr : null;
    const descriptionEn =
      typeof source.descriptionEn === "string" ? source.descriptionEn : null;
    const theme = normalizeMenuTheme(source.theme as string | null);
    const currency =
      typeof source.currency === "string" && source.currency.trim()
        ? source.currency.trim().toUpperCase().slice(0, 3)
        : "SAR";

    let workingHoursValue: string | null = null;
    if (source.workingHours != null) {
      workingHoursValue =
        typeof source.workingHours === "string"
          ? source.workingHours
          : JSON.stringify(source.workingHours);
    }

    const columnCheck = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Menus' AND COLUMN_NAME IN ('id', 'approvalStatus')
    `);
    const menuColumns = columnCheck.recordset as {
      COLUMN_NAME: string;
      DATA_TYPE: string;
    }[];
    const idColumn = menuColumns.find((c) => c.COLUMN_NAME === "id");
    const isIdString = idColumn != null && idColumn.DATA_TYPE === "nvarchar";
    const hasApprovalStatus = menuColumns.some(
      (c) => c.COLUMN_NAME === "approvalStatus",
    );

    const newMenuUuid = generateMenuUuid();

    const menuId = await executeTransaction(async (transaction) => {
      let newMenuId: string | number;

      if (isIdString) {
        newMenuId = await generateUniqueMenuId(7);
        const insertCols = hasApprovalStatus
          ? `id, uuid, userId, slug, logo, theme, currency, approvalStatus`
          : `id, uuid, userId, slug, logo, theme, currency`;
        const insertVals = hasApprovalStatus
          ? `@id, @uuid, @userId, @slug, @logo, @theme, @currency, @approvalStatus`
          : `@id, @uuid, @userId, @slug, @logo, @theme, @currency`;

        const insertRequest = transaction
          .request()
          .input("id", sql.NVarChar, newMenuId)
          .input("uuid", sql.UniqueIdentifier, newMenuUuid)
          .input("userId", sql.Int, userId)
          .input("slug", sql.NVarChar, slug)
          .input("logo", sql.NVarChar, logo)
          .input("theme", sql.NVarChar, theme)
          .input("currency", sql.NVarChar(3), currency);

        if (hasApprovalStatus) {
          insertRequest.input(
            "approvalStatus",
            sql.NVarChar(20),
            MENU_APPROVAL_STATUS.ACTIVE,
          );
        }

        await insertRequest.query(`
          INSERT INTO Menus (${insertCols})
          VALUES (${insertVals})
        `);
      } else {
        const insertCols = hasApprovalStatus
          ? `uuid, userId, slug, logo, theme, currency, approvalStatus`
          : `uuid, userId, slug, logo, theme, currency`;
        const insertVals = hasApprovalStatus
          ? `@uuid, @userId, @slug, @logo, @theme, @currency, @approvalStatus`
          : `@uuid, @userId, @slug, @logo, @theme, @currency`;

        const insertRequest = transaction
          .request()
          .input("uuid", sql.UniqueIdentifier, newMenuUuid)
          .input("userId", sql.Int, userId)
          .input("slug", sql.NVarChar, slug)
          .input("logo", sql.NVarChar, logo)
          .input("theme", sql.NVarChar, theme)
          .input("currency", sql.NVarChar(3), currency);

        if (hasApprovalStatus) {
          insertRequest.input(
            "approvalStatus",
            sql.NVarChar(20),
            MENU_APPROVAL_STATUS.ACTIVE,
          );
        }

        const menuResult = await insertRequest.query(`
          INSERT INTO Menus (${insertCols})
          OUTPUT INSERTED.id
          VALUES (${insertVals})
        `);
        newMenuId = menuResult.recordset[0].id;
      }

      const settingsRequest = transaction.request();
      if (isIdString) {
        settingsRequest.input("menuId", sql.NVarChar, newMenuId);
      } else {
        settingsRequest.input("menuId", sql.Int, newMenuId);
      }

      await settingsRequest
        .input("chatbotEnabled", sql.Bit, source.chatbotEnabled ? 1 : 0)
        .input("wifiEnabled", sql.Bit, source.wifiEnabled ? 1 : 0)
        .input(
          "wifiName",
          sql.NVarChar(255),
          typeof source.wifiName === "string" ? source.wifiName : null,
        )
        .input(
          "wifiPassword",
          sql.NVarChar(255),
          typeof source.wifiPassword === "string" ? source.wifiPassword : null,
        )
        .input("taxEnabled", sql.Bit, source.taxEnabled ? 1 : 0)
        .input(
          "taxPercent",
          sql.Decimal(5, 2),
          source.taxPercent == null ? null : Number(source.taxPercent),
        )
        .input("serviceEnabled", sql.Bit, source.serviceEnabled ? 1 : 0)
        .input(
          "servicePercent",
          sql.Decimal(5, 2),
          source.servicePercent == null ? null : Number(source.servicePercent),
        )
        .input(
          "footerLogo",
          sql.NVarChar,
          typeof source.footerLogo === "string" ? source.footerLogo : null,
        )
        .input(
          "footerDescriptionEn",
          sql.NVarChar,
          typeof source.footerDescriptionEn === "string"
            ? source.footerDescriptionEn
            : null,
        )
        .input(
          "footerDescriptionAr",
          sql.NVarChar,
          typeof source.footerDescriptionAr === "string"
            ? source.footerDescriptionAr
            : null,
        )
        .input(
          "socialFacebook",
          sql.NVarChar,
          typeof source.socialFacebook === "string"
            ? source.socialFacebook
            : null,
        )
        .input(
          "socialInstagram",
          sql.NVarChar,
          typeof source.socialInstagram === "string"
            ? source.socialInstagram
            : null,
        )
        .input(
          "socialTwitter",
          sql.NVarChar,
          typeof source.socialTwitter === "string"
            ? source.socialTwitter
            : null,
        )
        .input(
          "socialWhatsapp",
          sql.NVarChar,
          typeof source.socialWhatsapp === "string"
            ? source.socialWhatsapp
            : null,
        )
        .input(
          "addressEn",
          sql.NVarChar,
          typeof source.addressEn === "string" ? source.addressEn : null,
        )
        .input(
          "addressAr",
          sql.NVarChar,
          typeof source.addressAr === "string" ? source.addressAr : null,
        )
        .input(
          "phone",
          sql.NVarChar,
          typeof source.phone === "string" ? source.phone : null,
        )
        .input("workingHours", sql.NVarChar(sql.MAX), workingHoursValue)
        .input("deliveryOn", sql.Bit, source.deliveryOn ? 1 : 0)
        .input(
          "deliveryPhone",
          sql.NVarChar(50),
          typeof source.deliveryPhone === "string"
            ? source.deliveryPhone
            : null,
        )
        .input(
          "deliveryWhatsAppOn",
          sql.Bit,
          source.deliveryWhatsAppOn ? 1 : 0,
        )
        .input(
          "deliveryMode",
          sql.NVarChar(20),
          typeof source.deliveryMode === "string"
            ? source.deliveryMode
            : "governorates",
        ).query(`
          UPDATE Menus SET
            chatbotEnabled = @chatbotEnabled,
            wifiEnabled = @wifiEnabled,
            wifiName = @wifiName,
            wifiPassword = @wifiPassword,
            taxEnabled = @taxEnabled,
            taxPercent = @taxPercent,
            serviceEnabled = @serviceEnabled,
            servicePercent = @servicePercent,
            footerLogo = @footerLogo,
            footerDescriptionEn = @footerDescriptionEn,
            footerDescriptionAr = @footerDescriptionAr,
            socialFacebook = @socialFacebook,
            socialInstagram = @socialInstagram,
            socialTwitter = @socialTwitter,
            socialWhatsapp = @socialWhatsapp,
            addressEn = @addressEn,
            addressAr = @addressAr,
            phone = @phone,
            workingHours = @workingHours,
            deliveryOn = @deliveryOn,
            deliveryPhone = @deliveryPhone,
            deliveryWhatsAppOn = @deliveryWhatsAppOn,
            deliveryMode = @deliveryMode,
            deliveryLegacyUserSeedDone = 1
          WHERE id = @menuId
        `);

      for (const [locale, name, description] of [
        ["ar", nameAr, descriptionAr],
        ["en", nameEn, descriptionEn],
      ] as const) {
        const trRequest = transaction.request();
        if (isIdString) {
          trRequest.input("menuId", sql.NVarChar, newMenuId);
        } else {
          trRequest.input("menuId", sql.Int, newMenuId);
        }
        await trRequest
          .input("locale", sql.NVarChar, locale)
          .input("name", sql.NVarChar, name)
          .input("description", sql.NVarChar, description).query(`
            INSERT INTO MenuTranslations (menuId, locale, name, description)
            VALUES (@menuId, @locale, @name, @description)
          `);
      }

      const customResult = await transaction
        .request()
        .input("sourceMenuId", sql.Int, sourceMenuId).query(`
          SELECT primaryColor, secondaryColor, backgroundColor, textColor,
                 heroTitleAr, heroSubtitleAr, heroTitleEn, heroSubtitleEn
          FROM MenuCustomizations
          WHERE menuId = @sourceMenuId
        `);

      if (customResult.recordset.length > 0) {
        const c = customResult.recordset[0] as Record<string, unknown>;
        const customInsert = transaction.request();
        if (isIdString) {
          customInsert.input("menuId", sql.NVarChar, newMenuId);
        } else {
          customInsert.input("menuId", sql.Int, newMenuId);
        }
        await customInsert
          .input(
            "primaryColor",
            sql.NVarChar(20),
            typeof c.primaryColor === "string" ? c.primaryColor : null,
          )
          .input(
            "secondaryColor",
            sql.NVarChar(20),
            typeof c.secondaryColor === "string" ? c.secondaryColor : null,
          )
          .input(
            "backgroundColor",
            sql.NVarChar(20),
            typeof c.backgroundColor === "string" ? c.backgroundColor : null,
          )
          .input(
            "textColor",
            sql.NVarChar(20),
            typeof c.textColor === "string" ? c.textColor : null,
          )
          .input(
            "heroTitleAr",
            sql.NVarChar(200),
            typeof c.heroTitleAr === "string" ? c.heroTitleAr : null,
          )
          .input(
            "heroSubtitleAr",
            sql.NVarChar(500),
            typeof c.heroSubtitleAr === "string" ? c.heroSubtitleAr : null,
          )
          .input(
            "heroTitleEn",
            sql.NVarChar(200),
            typeof c.heroTitleEn === "string" ? c.heroTitleEn : null,
          )
          .input(
            "heroSubtitleEn",
            sql.NVarChar(500),
            typeof c.heroSubtitleEn === "string" ? c.heroSubtitleEn : null,
          ).query(`
            INSERT INTO MenuCustomizations (
              menuId, primaryColor, secondaryColor, backgroundColor, textColor,
              heroTitleAr, heroSubtitleAr, heroTitleEn, heroSubtitleEn
            )
            VALUES (
              @menuId, @primaryColor, @secondaryColor, @backgroundColor, @textColor,
              @heroTitleAr, @heroSubtitleAr, @heroTitleEn, @heroSubtitleEn
            )
          `);
      }

      const zonesResult = await transaction
        .request()
        .input("sourceMenuId", sql.Int, sourceMenuId).query(`
          SELECT nameAr, nameEn, price, lat, lan
          FROM MenuDeliveryGovernorates
          WHERE menuId = @sourceMenuId
          ORDER BY id
        `);

      for (const zone of zonesResult.recordset as Record<string, unknown>[]) {
        const zoneInsert = transaction.request();
        if (isIdString) {
          zoneInsert.input("menuId", sql.NVarChar, newMenuId);
        } else {
          zoneInsert.input("menuId", sql.Int, newMenuId);
        }
        await zoneInsert
          .input("nameAr", sql.NVarChar(255), zone.nameAr ?? "")
          .input("nameEn", sql.NVarChar(255), zone.nameEn ?? "")
          .input("price", sql.Decimal(10, 2), Number(zone.price ?? 0))
          .input(
            "lat",
            sql.Decimal(10, 8),
            zone.lat == null ? null : Number(zone.lat),
          )
          .input(
            "lan",
            sql.Decimal(11, 8),
            zone.lan == null ? null : Number(zone.lan),
          ).query(`
            INSERT INTO MenuDeliveryGovernorates (menuId, nameAr, nameEn, price, lat, lan)
            VALUES (@menuId, @nameAr, @nameEn, @price, @lat, @lan)
          `);
      }

      return newMenuId;
    });

    void logMenuActivitySafe(req, Number(menuId), {
      action: "MENU_COPIED",
      targetType: "menu",
      targetId: Number(menuId),
      summaryEn: `Menu copied from #${sourceMenuId} with slug ${slug}`,
      summaryAr: `تم نسخ المنيو من #${sourceMenuId} بالرابط ${slug}`,
      detailJson: JSON.stringify({ sourceMenuId, slug }),
    });

    res.status(201).json({
      message: "Menu copied successfully",
      menuId,
      uuid: newMenuUuid,
      slug,
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      logo,
      theme,
      currency,
      isActive: true,
    });
  } catch (error) {
    logger.error("Copy menu error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCopyMenu);
  }
}

// Get menu by ID
export async function getMenuById(req: Request, res: Response): Promise<void> {
  try {
    await ensureMenuChatbotSchema();
    await ensureMenuWifiTaxServiceSchema();
    await ensureMenuGroupSchema();
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
        .input("staffId", sql.Int, userId).query(`
        SELECT 
          m.id, m.uuid, m.userId, m.slug, m.logo, m.theme, m.isActive, m.createdAt,
          ISNULL(m.chatbotEnabled, 1) as chatbotEnabled,
          ISNULL(m.currency, 'SAR') as currency,
          m.footerLogo, m.footerDescriptionEn, m.footerDescriptionAr,
          m.socialFacebook, m.socialInstagram, m.socialTwitter, m.socialWhatsapp,
          m.addressEn, m.addressAr, m.phone, m.workingHours,
          ${MENU_WIFI_TAX_SERVICE_SELECT_SQL},
          ${MENU_GROUP_SELECT_SQL},
          ar.name as nameAr, ar.description as descriptionAr,
          en.name as nameEn, en.description as descriptionEn
        FROM Menus m
        ${MENU_GROUP_JOIN_SQL}
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
        .input("userId", sql.Int, userId).query(`
        SELECT 
          m.id, m.uuid, m.userId, m.slug, m.logo, m.theme, m.isActive, m.createdAt,
          ISNULL(m.chatbotEnabled, 1) as chatbotEnabled,
          ISNULL(m.currency, 'SAR') as currency,
          m.footerLogo, m.footerDescriptionEn, m.footerDescriptionAr,
          m.socialFacebook, m.socialInstagram, m.socialTwitter, m.socialWhatsapp,
          m.addressEn, m.addressAr, m.phone, m.workingHours,
          ${MENU_WIFI_TAX_SERVICE_SELECT_SQL},
          ${MENU_GROUP_SELECT_SQL},
          ar.name as nameAr, ar.description as descriptionAr,
          en.name as nameEn, en.description as descriptionEn
        FROM Menus m
        ${MENU_GROUP_JOIN_SQL}
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

    let menu = attachMenuGroupFields(result.recordset[0] as Record<string, unknown>);
    menu = attachWifiTaxServiceFields({
      ...menu,
      chatbotEnabled: normalizeChatbotEnabled(menu.chatbotEnabled),
      theme: normalizeMenuTheme(menu.theme as string | null),
    });

    // Parse workingHours if it's a JSON string
    if (menu.workingHours && typeof menu.workingHours === "string") {
      try {
        menu.workingHours = JSON.parse(menu.workingHours);
      } catch (e) {
        // If parsing fails, set to null
        menu.workingHours = null;
      }
    }

    // Get statistics for the menu
    const statsResult = await pool.request().input("menuId", sql.Int, menuIdNum)
      .query(`
        SELECT 
          (SELECT COUNT(*) FROM MenuItems WHERE menuId = @menuId) as totalItems,
          (SELECT COUNT(*) FROM MenuItems WHERE menuId = @menuId AND available = 1) as activeItems,
          (SELECT COUNT(*) FROM Categories WHERE menuId = @menuId) as categories,
          (SELECT COUNT(*) FROM MenuStaff WHERE menuId = @menuId) as staffCount,
          (SELECT COUNT(*) FROM MenuTables WHERE menuId = @menuId) as tablesCount
      `);

    const stats = statsResult.recordset[0];

    const viewsResult = await pool.request().input("menuId", sql.Int, menuIdNum)
      .query(`
        SELECT
          ISNULL(viewCount, 0) AS viewCount,
          ISNULL(qrScanCount, 0) AS qrScanCount
        FROM Menus WHERE id = @menuId
      `);
    const menuViews = Number(viewsResult.recordset[0]?.viewCount ?? 0);
    const menuQrScans = Number(viewsResult.recordset[0]?.qrScanCount ?? 0);

    const ownerUserId = menu.userId as number;
    const { capabilities } = await getUserPlanCapabilities(ownerUserId);

    // Staff & tables omitted when plan lacks staffAndTables
    if (!capabilities.staffAndTables) {
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
      chatbotEnabled,
      wifiEnabled,
      wifiName,
      wifiPassword,
      taxEnabled,
      taxPercent,
      serviceEnabled,
      servicePercent,
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
    await ensureMenuChatbotSchema();
    await ensureMenuWifiTaxServiceSchema();

    if (
      isActive === true &&
      req.user!.role !== ROLES.ADMIN &&
      !(await enforceActiveMenuLimitOnActivation(req, res, userId, menuId))
    ) {
      return;
    }

    let themeIdToSave: string | undefined;
    if (theme !== undefined) {
      themeIdToSave = normalizeMenuTheme(String(theme));
      if (!(await isThemeAllowedForUser(userId, themeIdToSave))) {
        sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
          code: "THEME_NOT_ALLOWED",
          theme: themeIdToSave,
        });
        return;
      }
    }

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
      const menuRequest = transaction.request().input("id", sql.Int, menuId);

      if (logo !== undefined) {
        touched.push("logo");
        menuUpdates.push("logo = @logo");
        menuRequest.input("logo", sql.NVarChar, logo || null);
      }

      if (themeIdToSave !== undefined) {
        touched.push("theme");
        menuUpdates.push("theme = @theme");
        menuRequest.input("theme", sql.NVarChar, themeIdToSave);
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

      if (chatbotEnabled !== undefined) {
        touched.push("chatbotEnabled");
        menuUpdates.push("chatbotEnabled = @chatbotEnabled");
        menuRequest.input("chatbotEnabled", sql.Bit, chatbotEnabled ? 1 : 0);
      }

      if (wifiEnabled !== undefined) {
        touched.push("wifiEnabled");
        menuUpdates.push("wifiEnabled = @wifiEnabled");
        menuRequest.input("wifiEnabled", sql.Bit, wifiEnabled ? 1 : 0);
      }

      if (wifiName !== undefined) {
        touched.push("wifiName");
        menuUpdates.push("wifiName = @wifiName");
        menuRequest.input("wifiName", sql.NVarChar(255), wifiName || null);
      }

      if (wifiPassword !== undefined) {
        touched.push("wifiPassword");
        menuUpdates.push("wifiPassword = @wifiPassword");
        menuRequest.input(
          "wifiPassword",
          sql.NVarChar(255),
          wifiPassword || null,
        );
      }

      if (taxEnabled !== undefined) {
        touched.push("taxEnabled");
        menuUpdates.push("taxEnabled = @taxEnabled");
        menuRequest.input("taxEnabled", sql.Bit, taxEnabled ? 1 : 0);
      }

      if (taxPercent !== undefined) {
        touched.push("taxPercent");
        menuUpdates.push("taxPercent = @taxPercent");
        menuRequest.input(
          "taxPercent",
          sql.Decimal(5, 2),
          taxPercent === null || taxPercent === ""
            ? null
            : Number(taxPercent),
        );
      }

      if (serviceEnabled !== undefined) {
        touched.push("serviceEnabled");
        menuUpdates.push("serviceEnabled = @serviceEnabled");
        menuRequest.input("serviceEnabled", sql.Bit, serviceEnabled ? 1 : 0);
      }

      if (servicePercent !== undefined) {
        touched.push("servicePercent");
        menuUpdates.push("servicePercent = @servicePercent");
        menuRequest.input(
          "servicePercent",
          sql.Decimal(5, 2),
          servicePercent === null || servicePercent === ""
            ? null
            : Number(servicePercent),
        );
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
          footerDescriptionEn || null,
        );
      }

      if (footerDescriptionAr !== undefined) {
        touched.push("footerDescriptionAr");
        menuUpdates.push("footerDescriptionAr = @footerDescriptionAr");
        menuRequest.input(
          "footerDescriptionAr",
          sql.NVarChar,
          footerDescriptionAr || null,
        );
      }

      if (socialFacebook !== undefined) {
        touched.push("socialFacebook");
        menuUpdates.push("socialFacebook = @socialFacebook");
        menuRequest.input(
          "socialFacebook",
          sql.NVarChar,
          socialFacebook || null,
        );
      }

      if (socialInstagram !== undefined) {
        touched.push("socialInstagram");
        menuUpdates.push("socialInstagram = @socialInstagram");
        menuRequest.input(
          "socialInstagram",
          sql.NVarChar,
          socialInstagram || null,
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
          socialWhatsapp || null,
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
          workingHours ? JSON.stringify(workingHours) : null,
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
  res: Response,
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

    const menuId = parseInt(id);

    if (
      isActive === true &&
      userRole !== ROLES.ADMIN &&
      !(await enforceActiveMenuLimitOnActivation(req, res, userId, menuId))
    ) {
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
      .input("id", sql.Int, menuId)
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
  res: Response,
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
