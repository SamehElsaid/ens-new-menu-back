import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool, sql } from "../config/database";
import {
  getMenuStaffColumnMeta,
  getStaffIsActive,
  getStaffPasswordHash,
  normalizeStaffRow,
  quoteMenuStaffIdent,
} from "../config/menuStaffColumns";
import { logger } from "../utils/logger";
import {
  generateRefreshToken,
  generateStaffAccessToken,
} from "../utils/tokenHelper";
import {
  normalizeStaffJobRole,
  STAFF_JOB_WAITER,
} from "../config/staffJobRoles";
import { RefreshTokenService } from "../services/refreshToken.service";
import { TokenBlacklistService } from "../services/tokenBlacklist.service";
import { ROLES } from "../config/constants";
import {
  isUserOnFreePlan,
  menuOwnerHasProPlan,
} from "../services/subscriptionPlan.service";
import { sendApiError } from "../utils/apiErrorResponse";

function parseMenuWorkingHours(workingHours: unknown): unknown {
  if (!workingHours) {
    return null;
  }
  if (typeof workingHours === "string") {
    try {
      return JSON.parse(workingHours);
    } catch {
      return null;
    }
  }
  return workingHours;
}

export async function staffLogin(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { email, password, menuSlug } = req.body;

    const pool = await getPool();

    // Find the menu by slug
    const menuResult = await pool
      .request()
      .input("slug", sql.NVarChar, menuSlug.toLowerCase().trim())
      .query(`
        SELECT
          m.id,
          m.userId,
          m.slug,
          m.logo,
          m.theme,
          m.isActive,
          m.createdAt,
          ISNULL(m.currency, 'SAR') as currency,
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
          ar.name as nameAr,
          ar.description as descriptionAr,
          en.name as nameEn,
          en.description as descriptionEn
        FROM Menus m
        LEFT JOIN MenuTranslations ar ON m.id = ar.menuId AND ar.locale = 'ar'
        LEFT JOIN MenuTranslations en ON m.id = en.menuId AND en.locale = 'en'
        WHERE m.slug = @slug
      `);

    if (menuResult.recordset.length === 0) {
      sendApiError(res, req, 404, {
        en: "Restaurant not found",
        ar: "المطعم غير موجود",
      });
      return;
    }

    const menu = menuResult.recordset[0];

    if (!menu.isActive) {
      sendApiError(res, req, 403, {
        en: "This restaurant is currently inactive",
        ar: "هذا المطعم غير مفعل حالياً",
      });
      return;
    }

    if (await isUserOnFreePlan(menu.userId as number)) {
      sendApiError(
        res,
        req,
        403,
        {
          en: "Staff access requires a Pro plan. Ask the owner to upgrade.",
          ar: "دخول الطاقم يتطلب خطة Pro. اطلب من صاحب المنيو الترقية.",
        },
        { code: "PRO_REQUIRED" }
      );
      return;
    }

    const staffMeta = await getMenuStaffColumnMeta();
    if (!staffMeta.emailKey) {
      sendApiError(res, req, 500, {
        en: "MenuStaff table has no email column",
        ar: "إعدادات جدول الموظفين غير مكتملة",
      });
      return;
    }

    const emailCol = quoteMenuStaffIdent(staffMeta.emailKey);
    const staffResult = await pool
      .request()
      .input("email", sql.NVarChar, email.toLowerCase().trim())
      .input("menuId", sql.Int, menu.id)
      .query(`
        SELECT *
        FROM MenuStaff
        WHERE ${emailCol} = @email AND menuId = @menuId
      `);

    if (staffResult.recordset.length === 0) {
      sendApiError(res, req, 401, {
        en: "Email not registered in this restaurant",
        ar: "البريد الإلكتروني غير مسجل في هذا المطعم",
      });
      return;
    }

    const staff = staffResult.recordset[0] as Record<string, unknown>;

    if (!getStaffIsActive(staff, staffMeta)) {
      sendApiError(res, req, 403, {
        en: "Your account is deactivated. Contact the restaurant manager.",
        ar: "تم إيقاف حسابك. تواصل مع إدارة المطعم.",
      });
      return;
    }

    const storedHash = getStaffPasswordHash(staff, staffMeta);
    if (!storedHash) {
      sendApiError(res, req, 401, {
        en: "No password set for your account. Contact the restaurant manager.",
        ar: "لم يتم تعيين كلمة مرور لحسابك. تواصل مع إدارة المطعم.",
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, storedHash);
    if (!isValidPassword) {
      sendApiError(res, req, 401, {
        en: "Invalid password",
        ar: "كلمة المرور غير صحيحة",
      });
      return;
    }

    const norm = normalizeStaffRow(staff, staffMeta);
    const staffJobRole =
      normalizeStaffJobRole(norm.role) ?? STAFF_JOB_WAITER;
    const tokenPayload = {
      id: staff.id as number,
      userId: staff.id as number,
      email: norm.email as string,
      role: ROLES.STAFF,
      staffJobRole,
    };

    const accessToken = generateStaffAccessToken(tokenPayload);
    let refreshToken: string | null = generateRefreshToken(tokenPayload);

    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setFullYear(refreshTokenExpiry.getFullYear() + 1);

    // RefreshTokens.userId has FK to Users.id. MenuStaff IDs may not exist there.
    const userExistsResult = await pool
      .request()
      .input("userId", sql.Int, tokenPayload.userId)
      .query("SELECT TOP 1 id FROM Users WHERE id = @userId");

    if (userExistsResult.recordset.length > 0) {
      try {
        await RefreshTokenService.storeToken(
          tokenPayload.userId,
          refreshToken,
          refreshTokenExpiry
        );
      } catch (storeError) {
        // Do not block successful staff login because of refresh-token persistence.
        logger.warn("Staff refresh token was not persisted; login continues", {
          staffId: tokenPayload.userId,
          error: storeError instanceof Error ? storeError.message : String(storeError),
        });
        refreshToken = null;
      }
    } else {
      logger.warn("Skipping staff refresh token persistence: no matching Users row", {
        staffId: tokenPayload.userId,
      });
      refreshToken = null;
    }

    const workingHours = parseMenuWorkingHours(menu.workingHours);

    res.json({
      message: "Login successful",
      staff: {
        id: norm.id,
        name: norm.name,
        email: norm.email,
        role: norm.role,
        phone: norm.phone,
        menuId: norm.menuId,
      },
      menu: {
        id: menu.id,
        userId: menu.userId,
        slug: menu.slug,
        logo: menu.logo,
        theme: menu.theme,
        isActive: menu.isActive,
        createdAt: menu.createdAt,
        currency: menu.currency,
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
        workingHours,
        nameAr: menu.nameAr,
        descriptionAr: menu.descriptionAr,
        nameEn: menu.nameEn,
        descriptionEn: menu.descriptionEn,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error("Staff login error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to login",
      ar: "فشل تسجيل الدخول",
    });
  }
}

export async function getStaffMe(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const staffId = req.user!.userId;

    const pool = await getPool();

    const meta = await getMenuStaffColumnMeta();

    const result = await pool
      .request()
      .input("staffId", sql.Int, staffId)
      .query(`
        SELECT
          s.*,
          m.userId as menuOwnerUserId,
          m.slug as menuSlug,
          m.logo as menuLogo,
          m.theme as menuTheme,
          m.isActive as menuIsActive,
          m.createdAt as menuCreatedAt,
          ISNULL(m.currency, 'SAR') as menuCurrency,
          m.footerLogo as menuFooterLogo,
          m.footerDescriptionEn as menuFooterDescriptionEn,
          m.footerDescriptionAr as menuFooterDescriptionAr,
          m.socialFacebook as menuSocialFacebook,
          m.socialInstagram as menuSocialInstagram,
          m.socialTwitter as menuSocialTwitter,
          m.socialWhatsapp as menuSocialWhatsapp,
          m.addressEn as menuAddressEn,
          m.addressAr as menuAddressAr,
          m.phone as menuPhone,
          m.workingHours as menuWorkingHours,
          ar.name as menuNameAr,
          ar.description as menuDescriptionAr,
          en.name as menuNameEn,
          en.description as menuDescriptionEn
        FROM MenuStaff s
        JOIN Menus m ON s.menuId = m.id
        LEFT JOIN MenuTranslations ar ON m.id = ar.menuId AND ar.locale = 'ar'
        LEFT JOIN MenuTranslations en ON m.id = en.menuId AND en.locale = 'en'
        WHERE s.id = @staffId
      `);

    if (result.recordset.length === 0) {
      sendApiError(res, req, 404, {
        en: "Staff member not found",
        ar: "لم يُعثر على عضو الطاقم",
      });
      return;
    }

    const staffMenuId = result.recordset[0].menuId as number;
    if (!(await menuOwnerHasProPlan(staffMenuId))) {
      sendApiError(
        res,
        req,
        403,
        {
          en: "Staff features require a Pro plan.",
          ar: "ميزات الطاقم تتطلب خطة Pro.",
        },
        { code: "PRO_REQUIRED" }
      );
      return;
    }

    const row = result.recordset[0] as Record<string, unknown>;
    const staff = normalizeStaffRow(row, meta);

    const workingHours = parseMenuWorkingHours(row.menuWorkingHours);

    res.json({
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        phone: staff.phone,
        isActive: staff.isActive,
        createdAt: staff.createdAt,
      },
      menu: {
        id: staff.menuId,
        userId: row.menuOwnerUserId,
        slug: row.menuSlug,
        logo: row.menuLogo,
        theme: row.menuTheme,
        isActive: row.menuIsActive,
        createdAt: row.menuCreatedAt,
        currency: row.menuCurrency,
        footerLogo: row.menuFooterLogo,
        footerDescriptionEn: row.menuFooterDescriptionEn,
        footerDescriptionAr: row.menuFooterDescriptionAr,
        socialFacebook: row.menuSocialFacebook,
        socialInstagram: row.menuSocialInstagram,
        socialTwitter: row.menuSocialTwitter,
        socialWhatsapp: row.menuSocialWhatsapp,
        addressEn: row.menuAddressEn,
        addressAr: row.menuAddressAr,
        phone: row.menuPhone,
        workingHours,
        nameAr: row.menuNameAr,
        descriptionAr: row.menuDescriptionAr,
        nameEn: row.menuNameEn,
        descriptionEn: row.menuDescriptionEn,
      },
    });
  } catch (error) {
    logger.error("Get staff me error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to get staff data",
      ar: "فشل جلب بيانات الطاقم",
    });
  }
}

export async function staffLogout(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const staffId = req.user!.userId;
    const { refreshToken } = req.body;

    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);

    if (accessToken) {
      const decoded = jwt.decode(accessToken) as { exp?: number } | null;
      const accessTokenExpiry = new Date();
      if (decoded?.exp) {
        accessTokenExpiry.setTime(decoded.exp * 1000);
      } else {
        accessTokenExpiry.setFullYear(accessTokenExpiry.getFullYear() + 100);
      }
      await TokenBlacklistService.addToBlacklist(
        accessToken,
        staffId,
        "access",
        accessTokenExpiry,
        "Staff logout"
      );
    }

    if (refreshToken) {
      await RefreshTokenService.revokeToken(refreshToken, "Staff logout");
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    logger.error("Staff logout error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to logout",
      ar: "فشل تسجيل الخروج",
    });
  }
}
