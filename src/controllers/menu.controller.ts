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
import { ensureDefaultRolesForMenu } from "../schemas/menuStaffRoles.schema";
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

    const numericMenuId = Number(menuId);
    if (Number.isFinite(numericMenuId)) {
      void ensureDefaultRolesForMenu(numericMenuId).catch((seedError) => {
        logger.warn("Failed to seed default staff roles for new menu", {
          menuId: numericMenuId,
          error:
            seedError instanceof Error ? seedError.message : String(seedError),
        });
      });
    }
  } catch (error) {
    logger.error("Create menu error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateMenu);
  }
}

function parseCopyFlag(raw: unknown, defaultValue: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === 0 || raw === "0" || raw === "false") return false;
  return defaultValue;
}

/**
 * Copy a menu into a new one. Body requires `slug`, `nameAr`, `nameEn`.
 * Optional flags (default: products false; settings/design/media/address true):
 * `copyProducts`, `copySettings`, `copyDesign`, `copyMedia`, `copyAddress`.
 * Logo is always copied when present (required to create a menu).
 * Does not copy staff, tables, ads, or group membership.
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

    const copyProducts = parseCopyFlag(req.body?.copyProducts, false);
    const copySettings = parseCopyFlag(req.body?.copySettings, true);
    const copyDesign = parseCopyFlag(req.body?.copyDesign, true);
    const copyMedia = parseCopyFlag(req.body?.copyMedia, true);
    const copyAddress = parseCopyFlag(req.body?.copyAddress, true);

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
      copySettings && typeof source.descriptionAr === "string"
        ? source.descriptionAr
        : null;
    const descriptionEn =
      copySettings && typeof source.descriptionEn === "string"
        ? source.descriptionEn
        : null;
    const theme = copyDesign
      ? normalizeMenuTheme(source.theme as string | null)
      : "default";
    const currency =
      copySettings &&
      typeof source.currency === "string" &&
      source.currency.trim()
        ? source.currency.trim().toUpperCase().slice(0, 3)
        : "SAR";

    let workingHoursValue: string | null = null;
    if (copySettings && source.workingHours != null) {
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
    const copyFlags = {
      copyProducts,
      copySettings,
      copyDesign,
      copyMedia,
      copyAddress,
    };

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

      const strOrNull = (value: unknown): string | null =>
        typeof value === "string" ? value : null;

      await settingsRequest
        .input(
          "chatbotEnabled",
          sql.Bit,
          copySettings ? (source.chatbotEnabled ? 1 : 0) : 1,
        )
        .input(
          "wifiEnabled",
          sql.Bit,
          copySettings && source.wifiEnabled ? 1 : 0,
        )
        .input(
          "wifiName",
          sql.NVarChar(255),
          copySettings ? strOrNull(source.wifiName) : null,
        )
        .input(
          "wifiPassword",
          sql.NVarChar(255),
          copySettings ? strOrNull(source.wifiPassword) : null,
        )
        .input(
          "taxEnabled",
          sql.Bit,
          copySettings && source.taxEnabled ? 1 : 0,
        )
        .input(
          "taxPercent",
          sql.Decimal(5, 2),
          copySettings && source.taxPercent != null
            ? Number(source.taxPercent)
            : null,
        )
        .input(
          "serviceEnabled",
          sql.Bit,
          copySettings && source.serviceEnabled ? 1 : 0,
        )
        .input(
          "servicePercent",
          sql.Decimal(5, 2),
          copySettings && source.servicePercent != null
            ? Number(source.servicePercent)
            : null,
        )
        .input(
          "footerLogo",
          sql.NVarChar,
          copyMedia ? strOrNull(source.footerLogo) : null,
        )
        .input(
          "footerDescriptionEn",
          sql.NVarChar,
          copySettings ? strOrNull(source.footerDescriptionEn) : null,
        )
        .input(
          "footerDescriptionAr",
          sql.NVarChar,
          copySettings ? strOrNull(source.footerDescriptionAr) : null,
        )
        .input(
          "socialFacebook",
          sql.NVarChar,
          copySettings ? strOrNull(source.socialFacebook) : null,
        )
        .input(
          "socialInstagram",
          sql.NVarChar,
          copySettings ? strOrNull(source.socialInstagram) : null,
        )
        .input(
          "socialTwitter",
          sql.NVarChar,
          copySettings ? strOrNull(source.socialTwitter) : null,
        )
        .input(
          "socialWhatsapp",
          sql.NVarChar,
          copySettings ? strOrNull(source.socialWhatsapp) : null,
        )
        .input(
          "addressEn",
          sql.NVarChar,
          copyAddress ? strOrNull(source.addressEn) : null,
        )
        .input(
          "addressAr",
          sql.NVarChar,
          copyAddress ? strOrNull(source.addressAr) : null,
        )
        .input(
          "phone",
          sql.NVarChar,
          copyAddress ? strOrNull(source.phone) : null,
        )
        .input("workingHours", sql.NVarChar(sql.MAX), workingHoursValue)
        .input(
          "deliveryOn",
          sql.Bit,
          copySettings && source.deliveryOn ? 1 : 0,
        )
        .input(
          "deliveryPhone",
          sql.NVarChar(50),
          copySettings ? strOrNull(source.deliveryPhone) : null,
        )
        .input(
          "deliveryWhatsAppOn",
          sql.Bit,
          copySettings ? (source.deliveryWhatsAppOn ? 1 : 0) : 1,
        )
        .input(
          "deliveryMode",
          sql.NVarChar(20),
          copySettings && typeof source.deliveryMode === "string"
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

      if (copyDesign) {
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
      }

      if (copySettings) {
        const zonesResult = await transaction
          .request()
          .input("sourceMenuId", sql.Int, sourceMenuId).query(`
            SELECT nameAr, nameEn, price, lat, lan
            FROM MenuDeliveryGovernorates
            WHERE menuId = @sourceMenuId
            ORDER BY id
          `);

        for (const zone of zonesResult.recordset as Record<
          string,
          unknown
        >[]) {
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
      }

      if (copyProducts) {
        const categoryColCheck = await transaction.request().query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'Categories' AND COLUMN_NAME = 'isActive'
        `);
        const hasCategoryIsActive =
          categoryColCheck.recordset.length > 0;

        const itemColCheck = await transaction.request().query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'MenuItems'
          AND COLUMN_NAME IN (
            'categoryId', 'originalPrice', 'discountPercent', 'sizes', 'variants'
          )
        `);
        const itemColumns = new Set(
          (
            itemColCheck.recordset as Array<{ COLUMN_NAME: string }>
          ).map((r) => r.COLUMN_NAME),
        );
        const hasCategoryId = itemColumns.has("categoryId");
        const hasOriginalPrice = itemColumns.has("originalPrice");
        const hasDiscountPercent = itemColumns.has("discountPercent");
        const hasSizes = itemColumns.has("sizes");
        const hasVariants = itemColumns.has("variants");

        const categoriesResult = await transaction
          .request()
          .input("sourceMenuId", sql.Int, sourceMenuId).query(`
            SELECT
              c.id, c.image, c.sortOrder,
              ${hasCategoryIsActive ? "ISNULL(c.isActive, 1) as isActive," : "1 as isActive,"}
              ar.name as nameAr, en.name as nameEn
            FROM Categories c
            LEFT JOIN CategoryTranslations ar ON c.id = ar.categoryId AND ar.locale = 'ar'
            LEFT JOIN CategoryTranslations en ON c.id = en.categoryId AND en.locale = 'en'
            WHERE c.menuId = @sourceMenuId
            ORDER BY c.sortOrder, c.id
          `);

        const categoryIdMap = new Map<number, number>();

        for (const cat of categoriesResult.recordset as Record<
          string,
          unknown
        >[]) {
          const oldCategoryId = Number(cat.id);
          const categoryInsert = transaction.request();
          if (isIdString) {
            categoryInsert.input("menuId", sql.NVarChar, newMenuId);
          } else {
            categoryInsert.input("menuId", sql.Int, newMenuId);
          }

          const catResult = await categoryInsert
            .input(
              "image",
              sql.NVarChar,
              typeof cat.image === "string" ? cat.image : null,
            )
            .input("sortOrder", sql.Int, Number(cat.sortOrder ?? 0)).query(`
              INSERT INTO Categories (menuId, image, sortOrder)
              OUTPUT INSERTED.id
              VALUES (@menuId, @image, @sortOrder)
            `);

          const newCategoryId = Number(catResult.recordset[0].id);
          categoryIdMap.set(oldCategoryId, newCategoryId);

          if (hasCategoryIsActive && !cat.isActive) {
            await transaction
              .request()
              .input("categoryId", sql.Int, newCategoryId)
              .input("isActive", sql.Bit, 0).query(`
                UPDATE Categories SET isActive = @isActive WHERE id = @categoryId
              `);
          }

          for (const [locale, name] of [
            ["ar", typeof cat.nameAr === "string" ? cat.nameAr : ""],
            ["en", typeof cat.nameEn === "string" ? cat.nameEn : ""],
          ] as const) {
            if (!name) continue;
            await transaction
              .request()
              .input("categoryId", sql.Int, newCategoryId)
              .input("locale", sql.NVarChar, locale)
              .input("name", sql.NVarChar, name).query(`
                INSERT INTO CategoryTranslations (categoryId, locale, name)
                VALUES (@categoryId, @locale, @name)
              `);
          }
        }

        const itemSelectCols = [
          "mi.id",
          "mi.category",
          hasCategoryId ? "mi.categoryId" : "NULL as categoryId",
          "mi.price",
          "mi.image",
          "ISNULL(mi.available, 1) as available",
          "mi.sortOrder",
        ];
        if (hasOriginalPrice) itemSelectCols.push("mi.originalPrice");
        if (hasDiscountPercent) itemSelectCols.push("mi.discountPercent");
        if (hasSizes) itemSelectCols.push("mi.sizes");
        if (hasVariants) itemSelectCols.push("mi.variants");

        const itemsResult = await transaction
          .request()
          .input("sourceMenuId", sql.Int, sourceMenuId).query(`
            SELECT
              ${itemSelectCols.join(", ")},
              ar.name as nameAr, ar.description as descriptionAr,
              en.name as nameEn, en.description as descriptionEn
            FROM MenuItems mi
            LEFT JOIN MenuItemTranslations ar ON mi.id = ar.menuItemId AND ar.locale = 'ar'
            LEFT JOIN MenuItemTranslations en ON mi.id = en.menuItemId AND en.locale = 'en'
            WHERE mi.menuId = @sourceMenuId
            ORDER BY mi.sortOrder, mi.id
          `);

        for (const item of itemsResult.recordset as Record<
          string,
          unknown
        >[]) {
          const oldCategoryId =
            item.categoryId == null ? null : Number(item.categoryId);
          const newCategoryId =
            oldCategoryId != null
              ? (categoryIdMap.get(oldCategoryId) ?? null)
              : null;

          const itemInsert = transaction.request();
          if (isIdString) {
            itemInsert.input("menuId", sql.NVarChar, newMenuId);
          } else {
            itemInsert.input("menuId", sql.Int, newMenuId);
          }

          const insertCols = [
            "menuId",
            "category",
            "price",
            "image",
            "available",
            "sortOrder",
          ];
          const insertVals = [
            "@menuId",
            "@category",
            "@price",
            "@image",
            "@available",
            "@sortOrder",
          ];

          itemInsert
            .input(
              "category",
              sql.NVarChar,
              typeof item.category === "string" ? item.category : "main",
            )
            .input("price", sql.Decimal(10, 2), Number(item.price ?? 0))
            .input(
              "image",
              sql.NVarChar,
              typeof item.image === "string" ? item.image : null,
            )
            .input("available", sql.Bit, item.available ? 1 : 0)
            .input("sortOrder", sql.Int, Number(item.sortOrder ?? 0));

          if (hasCategoryId) {
            insertCols.push("categoryId");
            insertVals.push("@categoryId");
            itemInsert.input("categoryId", sql.Int, newCategoryId);
          }
          if (hasOriginalPrice) {
            insertCols.push("originalPrice");
            insertVals.push("@originalPrice");
            itemInsert.input(
              "originalPrice",
              sql.Decimal(10, 2),
              item.originalPrice == null ? null : Number(item.originalPrice),
            );
          }
          if (hasDiscountPercent) {
            insertCols.push("discountPercent");
            insertVals.push("@discountPercent");
            itemInsert.input(
              "discountPercent",
              sql.Int,
              item.discountPercent == null
                ? null
                : Number(item.discountPercent),
            );
          }
          if (hasSizes) {
            insertCols.push("sizes");
            insertVals.push("@sizes");
            itemInsert.input(
              "sizes",
              sql.NVarChar(sql.MAX),
              typeof item.sizes === "string"
                ? item.sizes
                : item.sizes == null
                  ? null
                  : JSON.stringify(item.sizes),
            );
          }
          if (hasVariants) {
            insertCols.push("variants");
            insertVals.push("@variants");
            itemInsert.input(
              "variants",
              sql.NVarChar(sql.MAX),
              typeof item.variants === "string"
                ? item.variants
                : item.variants == null
                  ? null
                  : JSON.stringify(item.variants),
            );
          }

          const itemResult = await itemInsert.query(`
            INSERT INTO MenuItems (${insertCols.join(", ")})
            OUTPUT INSERTED.id
            VALUES (${insertVals.join(", ")})
          `);

          const newItemId = Number(itemResult.recordset[0].id);

          for (const [locale, name, description] of [
            [
              "ar",
              typeof item.nameAr === "string" ? item.nameAr : "",
              typeof item.descriptionAr === "string"
                ? item.descriptionAr
                : null,
            ],
            [
              "en",
              typeof item.nameEn === "string" ? item.nameEn : "",
              typeof item.descriptionEn === "string"
                ? item.descriptionEn
                : null,
            ],
          ] as const) {
            if (!name) continue;
            await transaction
              .request()
              .input("menuItemId", sql.Int, newItemId)
              .input("locale", sql.NVarChar, locale)
              .input("name", sql.NVarChar, name)
              .input("description", sql.NVarChar, description).query(`
                INSERT INTO MenuItemTranslations (menuItemId, locale, name, description)
                VALUES (@menuItemId, @locale, @name, @description)
              `);
          }
        }
      }

      return newMenuId;
    });

    void logMenuActivitySafe(req, Number(menuId), {
      action: "MENU_COPIED",
      targetType: "menu",
      targetId: Number(menuId),
      summaryEn: `Menu copied from #${sourceMenuId} with slug ${slug}`,
      summaryAr: `تم نسخ المنيو من #${sourceMenuId} بالرابط ${slug}`,
      detailJson: JSON.stringify({ sourceMenuId, slug, ...copyFlags }),
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
      ...copyFlags,
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
// export async function deleteMenu(req: Request, res: Response): Promise<void> {
//   try {
//     if (req.user?.role === ROLES.STAFF) {
//       sendApiError(res, req, 403, {
//         en: "Only the menu owner can delete this menu.",
//         ar: "يستطيع مالك القائمة فقط حذفها.",
//       });
//       return;
//     }

//     const userId = req.user!.userId;
//     const { id } = req.params;

//     const pool = await getPool();

//     const result = await pool
//       .request()
//       .input("id", sql.Int, parseInt(id))
//       .input("userId", sql.Int, userId)
//       .query("DELETE FROM Menus WHERE id = @id AND userId = @userId");

//     if (result.rowsAffected[0] === 0) {
//       sendApiError(res, req, 404, ApiErrors.menuNotFound);
//       return;
//     }

//     res.json({ message: "Menu deleted successfully" });
//   } catch (error) {
//     logger.error("Delete menu error:", error);
//     sendApiError(res, req, 500, ApiErrors.failedDeleteMenu);
//   }
// }

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
    const menuId = parseInt(req.params.id, 10);
    const pool = await getPool();

    // تأكد إن المنيو ملك اليوزر
    const owned = await pool
      .request()
      .input("id", sql.Int, menuId)
      .input("userId", sql.Int, userId)
      .query(`SELECT id FROM Menus WHERE id = @id AND userId = @userId`);

    if (!owned.recordset.length) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    // 1) امسح الموظفين الأول (بيفك FK_MenuStaff_Role)
    await pool
      .request()
      .input("id", sql.Int, menuId)
      .query(`DELETE FROM MenuStaff WHERE menuId = @id`);

    // 2) اختياري صريح — أو سيبه للـ CASCADE
    await pool
      .request()
      .input("id", sql.Int, menuId)
      .query(`DELETE FROM MenuStaffRoles WHERE menuId = @id`);

    // 3) امسح المنيو
    await pool
      .request()
      .input("id", sql.Int, menuId)
      .input("userId", sql.Int, userId)
      .query(`DELETE FROM Menus WHERE id = @id AND userId = @userId`);

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
