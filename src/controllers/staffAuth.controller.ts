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
import { generateRefreshToken, generateStaffAccessToken } from "../utils/tokenHelper";
import { RefreshTokenService } from "../services/refreshToken.service";
import { TokenBlacklistService } from "../services/tokenBlacklist.service";
import { ROLES } from "../config/constants";

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
        SELECT m.id, m.slug, m.isActive,
               ar.name as nameAr, en.name as nameEn
        FROM Menus m
        LEFT JOIN MenuTranslations ar ON m.id = ar.menuId AND ar.locale = 'ar'
        LEFT JOIN MenuTranslations en ON m.id = en.menuId AND en.locale = 'en'
        WHERE m.slug = @slug
      `);

    if (menuResult.recordset.length === 0) {
      res.status(404).json({ error: "المطعم غير موجود", errorEn: "Restaurant not found" });
      return;
    }

    const menu = menuResult.recordset[0];

    if (!menu.isActive) {
      res.status(403).json({
        error: "هذا المطعم غير مفعل حالياً",
        errorEn: "This restaurant is currently inactive",
      });
      return;
    }

    const staffMeta = await getMenuStaffColumnMeta();
    if (!staffMeta.emailKey) {
      res.status(500).json({
        error: "إعدادات جدول الموظفين غير مكتملة",
        errorEn: "MenuStaff table has no email column",
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
      res.status(401).json({
        error: "البريد الإلكتروني غير مسجل في هذا المطعم",
        errorEn: "Email not registered in this restaurant",
      });
      return;
    }

    const staff = staffResult.recordset[0] as Record<string, unknown>;

    if (!getStaffIsActive(staff, staffMeta)) {
      res.status(403).json({
        error: "تم إيقاف حسابك. تواصل مع إدارة المطعم.",
        errorEn: "Your account is deactivated. Contact the restaurant manager.",
      });
      return;
    }

    const storedHash = getStaffPasswordHash(staff, staffMeta);
    if (!storedHash) {
      res.status(401).json({
        error: "لم يتم تعيين كلمة مرور لحسابك. تواصل مع إدارة المطعم.",
        errorEn: "No password set for your account. Contact the restaurant manager.",
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, storedHash);
    if (!isValidPassword) {
      res.status(401).json({
        error: "كلمة المرور غير صحيحة",
        errorEn: "Invalid password",
      });
      return;
    }

    const norm = normalizeStaffRow(staff, staffMeta);
    const tokenPayload = {
      id: staff.id as number,
      userId: staff.id as number,
      email: norm.email as string,
      role: ROLES.STAFF,
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
        slug: menu.slug,
        nameAr: menu.nameAr,
        nameEn: menu.nameEn,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error("Staff login error:", error);
    res.status(500).json({ error: "Failed to login" });
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
          m.slug as menuSlug,
          ar.name as menuNameAr, en.name as menuNameEn
        FROM MenuStaff s
        JOIN Menus m ON s.menuId = m.id
        LEFT JOIN MenuTranslations ar ON m.id = ar.menuId AND ar.locale = 'ar'
        LEFT JOIN MenuTranslations en ON m.id = en.menuId AND en.locale = 'en'
        WHERE s.id = @staffId
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    const row = result.recordset[0] as Record<string, unknown>;
    const staff = normalizeStaffRow(row, meta);

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
        slug: row.menuSlug,
        nameAr: row.menuNameAr,
        nameEn: row.menuNameEn,
      },
    });
  } catch (error) {
    logger.error("Get staff me error:", error);
    res.status(500).json({ error: "Failed to get staff data" });
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
    res.status(500).json({ error: "Failed to logout" });
  }
}
