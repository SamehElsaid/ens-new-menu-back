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

export async function staffLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const rawExpoToken =
      typeof req.body?.expoToken === "string" ? req.body.expoToken : null;
    const expoToken =
      rawExpoToken && rawExpoToken.trim().length > 0
        ? rawExpoToken.trim().slice(0, 256)
        : null;

    const pool = await getPool();

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
      .input("email", sql.NVarChar, email.toLowerCase().trim()).query(`
        SELECT
          s.*,
          m.id as menuTableId,
          m.uuid as menuUuid,
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
        WHERE ${emailCol} = @email
      `);

    if (staffResult.recordset.length === 0) {
      sendApiError(res, req, 401, {
        en: "Invalid email or password",
        ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      });
      return;
    }

    let matchedRow: Record<string, unknown> | null = null;

    for (const row of staffResult.recordset) {
      const staff = row as Record<string, unknown>;
      const storedHash = getStaffPasswordHash(staff, staffMeta);

      if (!storedHash) {
        continue;
      }

      const isValidPassword = await bcrypt.compare(password, storedHash);
      if (!isValidPassword) {
        continue;
      }

      if (!getStaffIsActive(staff, staffMeta)) {
        sendApiError(res, req, 403, {
          en: "Your account is deactivated. Contact the restaurant manager.",
          ar: "تم إيقاف حسابك. تواصل مع إدارة المطعم.",
        });
        return;
      }

      if (matchedRow) {
        sendApiError(res, req, 409, {
          en: "This email is linked to multiple restaurants. Contact your manager.",
          ar: "هذا البريد مرتبط بعدة مطاعم. تواصل مع المدير.",
        });
        return;
      }

      matchedRow = staff;
    }

    if (!matchedRow) {
      const hasStaffWithoutPassword = staffResult.recordset.some((row) => {
        const staff = row as Record<string, unknown>;
        return (
          getStaffIsActive(staff, staffMeta) &&
          !getStaffPasswordHash(staff, staffMeta)
        );
      });

      if (hasStaffWithoutPassword) {
        sendApiError(res, req, 401, {
          en: "No password set for your account. Contact the restaurant manager.",
          ar: "لم يتم تعيين كلمة مرور لحسابك. تواصل مع إدارة المطعم.",
        });
        return;
      }

      sendApiError(res, req, 401, {
        en: "Invalid email or password",
        ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      });
      return;
    }

    const staff = matchedRow;

    if (!staff.menuIsActive) {
      sendApiError(res, req, 403, {
        en: "This restaurant is currently inactive",
        ar: "هذا المطعم غير مفعل حالياً",
      });
      return;
    }

    if (await isUserOnFreePlan(staff.menuOwnerUserId as number)) {
      sendApiError(
        res,
        req,
        403,
        {
          en: "Staff access requires a Pro plan. Ask the owner to upgrade.",
          ar: "دخول الطاقم يتطلب خطة Pro. اطلب من صاحب المنيو الترقية.",
        },
        { code: "PRO_REQUIRED" },
      );
      return;
    }

    if (expoToken && staffMeta.expoTokenColumnQuoted) {
      try {
        await pool
          .request()
          .input("token", sql.NVarChar(256), expoToken)
          .input("staffId", sql.Int, staff.id as number)
          .query(
            `UPDATE MenuStaff
             SET ${staffMeta.expoTokenColumnQuoted} = @token
             WHERE id = @staffId`,
          );
      } catch (tokenError) {
        logger.warn("Failed to persist staff expoToken", {
          staffId: staff.id,
          error:
            tokenError instanceof Error
              ? tokenError.message
              : String(tokenError),
        });
      }
    } else if (expoToken && !staffMeta.expoTokenColumnQuoted) {
      logger.warn(
        "Received expoToken but MenuStaff has no expoPushToken column; run database/menu_staff_expo_push_token.sql",
      );
    }

    const norm = normalizeStaffRow(staff, staffMeta);
    const staffJobRole = normalizeStaffJobRole(norm.role) ?? STAFF_JOB_WAITER;
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
          refreshTokenExpiry,
        );
      } catch (storeError) {
        // Do not block successful staff login because of refresh-token persistence.
        logger.warn("Staff refresh token was not persisted; login continues", {
          staffId: tokenPayload.userId,
          error:
            storeError instanceof Error
              ? storeError.message
              : String(storeError),
        });
        refreshToken = null;
      }
    } else {
      logger.warn(
        "Skipping staff refresh token persistence: no matching Users row",
        {
          staffId: tokenPayload.userId,
        },
      );
      refreshToken = null;
    }

    const workingHours = parseMenuWorkingHours(staff.menuWorkingHours);

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
        id: staff.menuTableId,
        uuid: staff.menuUuid,
        userId: staff.menuOwnerUserId,
        slug: staff.menuSlug,
        logo: staff.menuLogo,
        theme: staff.menuTheme,
        isActive: staff.menuIsActive,
        createdAt: staff.menuCreatedAt,
        currency: staff.menuCurrency,
        footerLogo: staff.menuFooterLogo,
        footerDescriptionEn: staff.menuFooterDescriptionEn,
        footerDescriptionAr: staff.menuFooterDescriptionAr,
        socialFacebook: staff.menuSocialFacebook,
        socialInstagram: staff.menuSocialInstagram,
        socialTwitter: staff.menuSocialTwitter,
        socialWhatsapp: staff.menuSocialWhatsapp,
        addressEn: staff.menuAddressEn,
        addressAr: staff.menuAddressAr,
        phone: staff.menuPhone,
        workingHours,
        nameAr: staff.menuNameAr,
        descriptionAr: staff.menuDescriptionAr,
        nameEn: staff.menuNameEn,
        descriptionEn: staff.menuDescriptionEn,
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

export async function getStaffMe(req: Request, res: Response): Promise<void> {
  try {
    const staffId = req.user!.userId;

    const pool = await getPool();

    const meta = await getMenuStaffColumnMeta();

    const result = await pool.request().input("staffId", sql.Int, staffId)
      .query(`
        SELECT
          s.*,
          m.userId as menuOwnerUserId,
          m.uuid as menuUuid,
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
        { code: "PRO_REQUIRED" },
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
        uuid: row.menuUuid,
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

export async function staffLogout(req: Request, res: Response): Promise<void> {
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

      // TokenBlacklist.userId has an FK to Users.id. Staff ids come from
      // MenuStaff and may not exist in Users, so check before inserting to
      // avoid the FK violation breaking a valid logout.
      try {
        const pool = await getPool();
        const userExists = await pool
          .request()
          .input("userId", sql.Int, staffId)
          .query("SELECT TOP 1 id FROM Users WHERE id = @userId");

        if (userExists.recordset.length > 0) {
          await TokenBlacklistService.addToBlacklist(
            accessToken,
            staffId,
            "access",
            accessTokenExpiry,
            "Staff logout",
          );
        } else {
          logger.warn(
            "Skipping access-token blacklist: no matching Users row for staff",
            { staffId },
          );
        }
      } catch (blacklistError) {
        logger.warn("Failed to blacklist staff access token on logout", {
          staffId,
          error:
            blacklistError instanceof Error
              ? blacklistError.message
              : String(blacklistError),
        });
      }
    }

    if (refreshToken) {
      try {
        await RefreshTokenService.revokeToken(refreshToken, "Staff logout");
      } catch (revokeError) {
        logger.warn("Failed to revoke staff refresh token on logout", {
          staffId,
          error:
            revokeError instanceof Error
              ? revokeError.message
              : String(revokeError),
        });
      }
    }

    try {
      const staffMeta = await getMenuStaffColumnMeta();
      if (staffMeta.expoTokenColumnQuoted) {
        const pool = await getPool();
        await pool
          .request()
          .input("staffId", sql.Int, staffId)
          .query(
            `UPDATE MenuStaff
             SET ${staffMeta.expoTokenColumnQuoted} = NULL
             WHERE id = @staffId`,
          );
      }
    } catch (clearTokenError) {
      logger.warn("Failed to clear staff expoToken on logout", {
        staffId,
        error:
          clearTokenError instanceof Error
            ? clearTokenError.message
            : String(clearTokenError),
      });
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
