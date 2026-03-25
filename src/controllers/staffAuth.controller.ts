import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import { generateAccessToken, generateRefreshToken } from "../utils/tokenHelper";
import { RefreshTokenService } from "../services/refreshToken.service";
import { TokenBlacklistService } from "../services/tokenBlacklist.service";

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

    // Find the staff member by email + menuId
    const staffResult = await pool
      .request()
      .input("email", sql.NVarChar, email.toLowerCase().trim())
      .input("menuId", sql.Int, menu.id)
      .query(`
        SELECT id, menuId, name, role, phone, email, password, isActive
        FROM MenuStaff
        WHERE email = @email AND menuId = @menuId
      `);

    if (staffResult.recordset.length === 0) {
      res.status(401).json({
        error: "البريد الإلكتروني غير مسجل في هذا المطعم",
        errorEn: "Email not registered in this restaurant",
      });
      return;
    }

    const staff = staffResult.recordset[0];

    if (!staff.isActive) {
      res.status(403).json({
        error: "تم إيقاف حسابك. تواصل مع إدارة المطعم.",
        errorEn: "Your account is deactivated. Contact the restaurant manager.",
      });
      return;
    }

    if (!staff.password) {
      res.status(401).json({
        error: "لم يتم تعيين كلمة مرور لحسابك. تواصل مع إدارة المطعم.",
        errorEn: "No password set for your account. Contact the restaurant manager.",
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, staff.password);
    if (!isValidPassword) {
      res.status(401).json({
        error: "كلمة المرور غير صحيحة",
        errorEn: "Invalid password",
      });
      return;
    }

    const tokenPayload = {
      id: staff.id,
      userId: staff.id,
      email: staff.email,
      role: "staff",
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setFullYear(refreshTokenExpiry.getFullYear() + 1);
    await RefreshTokenService.storeToken(
      staff.id,
      refreshToken,
      refreshTokenExpiry
    );

    res.json({
      message: "Login successful",
      staff: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        phone: staff.phone,
        menuId: staff.menuId,
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

    const result = await pool
      .request()
      .input("staffId", sql.Int, staffId)
      .query(`
        SELECT
          s.id, s.menuId, s.name, s.role, s.phone, s.email, s.isActive, s.createdAt,
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

    const staff = result.recordset[0];

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
        slug: staff.menuSlug,
        nameAr: staff.menuNameAr,
        nameEn: staff.menuNameEn,
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
      const accessTokenExpiry = new Date();
      accessTokenExpiry.setMinutes(accessTokenExpiry.getMinutes() + 15);
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
