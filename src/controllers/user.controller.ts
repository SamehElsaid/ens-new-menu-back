import { Request, Response } from "express";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { getPool, sql } from "../config/database";
import bcrypt from "bcryptjs";
import { logger } from "../utils/logger";
import { getImageUrl } from "../utils/urlHelper";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

// Get user profile
export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const pool = await getPool();

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT 
          id, email, name, phoneNumber, country, dateOfBirth, gender, address,
          role, isEmailVerified, createdAt, profileImage,
          CAST(
            CASE
              WHEN NULLIF(LTRIM(RTRIM(ISNULL(fcmToken, N''))), N'') IS NOT NULL
              THEN 1
              ELSE 0
            END
          AS BIT) AS hasFcmToken
        FROM Users
        WHERE id = @userId
      `);

    if (result.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }

    const row = result.recordset[0] as Record<string, unknown> & {
      hasFcmToken?: unknown;
    };
    res.json({
      user: { ...row, hasFcmToken: Boolean(row.hasFcmToken) },
    });
  } catch (error) {
    logger.error("Get profile error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetProfile);
  }
}

// Update user profile (supports JSON or multipart/form-data with optional profileImage file)
export async function updateProfile(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const {
      name,
      phone,
      phoneNumber,
      country,
      dateOfBirth,
      gender,
      address,
      profileImage: profileImageBody,
    } = req.body;

    // If client sent multipart with a file, save it and get URL (same as /api/upload type=profile-images)
    let profileImageUrl: string | null = null;
    if ((req as any).file?.buffer) {
      const file = (req as any).file;
      const uploadDir = path.join(process.cwd(), "uploads", "profile-images");
      await fs.mkdir(uploadDir, { recursive: true });
      const filename = `${uuidv4()}.webp`;
      const filePath = path.join(uploadDir, filename);
      await sharp(file.buffer)
        .resize(400, 400, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(filePath);
      profileImageUrl = getImageUrl(`/uploads/profile-images/${filename}`);
    }

    const profileImage =
      profileImageUrl ??
      (typeof profileImageBody === "string" ? profileImageBody : undefined);

    const pool = await getPool();

    const updates: string[] = [];
    const request = pool.request().input("userId", sql.Int, userId);

    if (name !== undefined) {
      updates.push("name = @name");
      request.input("name", sql.NVarChar, name);
    }

    // Accept both 'phone' and 'phoneNumber' for compatibility
    const phoneValue = phone ?? phoneNumber;
    if (phoneValue !== undefined) {
      updates.push("phoneNumber = @phoneNumber");
      request.input("phoneNumber", sql.NVarChar, phoneValue || null);
    }

    if (country !== undefined) {
      updates.push("country = @country");
      request.input("country", sql.NVarChar, country || null);
    }

    if (dateOfBirth !== undefined) {
      updates.push("dateOfBirth = @dateOfBirth");
      request.input("dateOfBirth", sql.Date, dateOfBirth || null);
    }

    if (gender !== undefined) {
      updates.push("gender = @gender");
      request.input("gender", sql.NVarChar, gender || null);
    }

    if (address !== undefined) {
      updates.push("address = @address");
      request.input("address", sql.NVarChar, address || null);
    }

    if (profileImage !== undefined) {
      updates.push("profileImage = @profileImage");
      request.input("profileImage", sql.NVarChar, profileImage || null);
    }

    if (updates.length === 0) {
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
      return;
    }

    await request.query(`
      UPDATE Users 
      SET ${updates.join(", ")}
      WHERE id = @userId
    `);

    // Get updated user data
    const userResult = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT 
          id, email, name, phoneNumber, country, dateOfBirth, gender, address,
          role, isEmailVerified, createdAt, profileImage,
          CAST(
            CASE
              WHEN NULLIF(LTRIM(RTRIM(ISNULL(fcmToken, N''))), N'') IS NOT NULL
              THEN 1
              ELSE 0
            END
          AS BIT) AS hasFcmToken
        FROM Users
        WHERE id = @userId
      `);

    const updated = userResult.recordset[0] as Record<string, unknown> & {
      hasFcmToken?: unknown;
    };

    res.json({
      message: "Profile updated successfully",
      user: { ...updated, hasFcmToken: Boolean(updated.hasFcmToken) },
    });
  } catch (error) {
    logger.error("Update profile error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateProfile);
  }
}

// Change password
export async function changePassword(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;

    const pool = await getPool();

    // Get current password hash
    const userResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query("SELECT password FROM Users WHERE id = @userId");

    if (userResult.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }

    // Verify current password
    const isValid = await bcrypt.compare(
      currentPassword,
      userResult.recordset[0].password,
    );

    if (!isValid) {
      sendApiError(res, req, 401, ApiErrors.currentPasswordIncorrect);
      return;
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("password", sql.NVarChar, newPasswordHash)
      .query("UPDATE Users SET password = @password WHERE id = @userId");

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    logger.error("Change password error:", error);
    sendApiError(res, req, 500, ApiErrors.failedChangePassword);
  }
}

// Get user statistics
export async function getStatistics(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;

    const pool = await getPool();

    // Get menu count
    const menuResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query("SELECT COUNT(*) as count FROM Menus WHERE userId = @userId");

    // Get total items count
    const itemsResult = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT COUNT(*) as count 
        FROM MenuItems mi
        JOIN Menus m ON mi.menuId = m.id
        WHERE m.userId = @userId
      `);

    // Get total ratings count and average
    const ratingsResult = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT 
          COUNT(*) as count,
          AVG(CAST(rating AS FLOAT)) as average
        FROM Ratings r
        JOIN Menus m ON r.menuId = m.id
        WHERE m.userId = @userId
      `);

    // Get active menus count
    const activeMenusResult = await pool
      .request()
      .input("userId", sql.Int, userId).query(`
        SELECT COUNT(*) as count 
        FROM Menus 
        WHERE userId = @userId AND isActive = 1
      `);

    res.json({
      statistics: {
        totalMenus: menuResult.recordset[0].count,
        activeMenus: activeMenusResult.recordset[0].count,
        totalItems: itemsResult.recordset[0].count,
        totalRatings: ratingsResult.recordset[0].count,
        averageRating: ratingsResult.recordset[0].average || 0,
      },
    });
  } catch (error) {
    logger.error("Get statistics error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetStatistics);
  }
}

// Upgrade plan (for future payment integration)
export async function upgradePlan(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { planType } = req.body; // 'free', 'monthly', 'yearly'

    // Define plan limits
    const planLimits: Record<string, number> = {
      free: 1,
      monthly: 5,
      yearly: 20,
    };

    if (!planLimits[planType]) {
      sendApiError(res, req, 400, ApiErrors.invalidPlanType);
      return;
    }

    const pool = await getPool();

    await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("planType", sql.NVarChar, planType)
      .input("menusLimit", sql.Int, planLimits[planType]).query(`
        UPDATE Users 
        SET planType = @planType, menusLimit = @menusLimit
        WHERE id = @userId
      `);

    res.json({
      message: "Plan upgraded successfully",
      planType,
      menusLimit: planLimits[planType],
    });
  } catch (error) {
    logger.error("Upgrade plan error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpgradePlan);
  }
}

// Get user subscription
export async function getSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const pool = await getPool();

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT TOP 1
          s.id, s.userId, s.planId, s.status, s.startDate, s.endDate, 
          s.billingCycle, s.amount, s.createdAt,
          p.name as planName, p.maxMenus, p.maxProductsPerMenu
        FROM Subscriptions s
        LEFT JOIN Plans p ON s.planId = p.id
        WHERE s.userId = @userId 
          AND s.status = 'active' 
          AND (s.endDate IS NULL OR s.endDate > GETDATE())
        ORDER BY s.id DESC
      `);

    if (result.recordset.length === 0) {
      // Return default free subscription if no active subscription found
      // Get free plan limits
      const freePlanResult = await pool.request().query(`
        SELECT maxMenus, maxProductsPerMenu
        FROM Plans
        WHERE name = 'Free'
      `);
      const freePlan = freePlanResult.recordset[0] || {
        maxMenus: 1,
        maxProductsPerMenu: 20,
      };

      res.json({
        subscription: {
          plan: "Free",
          planName: "Free",
          status: "active",
          billingCycle: "free",
          startDate: null,
          endDate: null,
          amount: 0,
          maxMenus: freePlan.maxMenus,
          maxProductsPerMenu: freePlan.maxProductsPerMenu,
        },
      });
      return;
    }

    const subscription = result.recordset[0];
    res.json({
      subscription: {
        ...subscription,
        plan: subscription.planName || "Free",
      },
    });
  } catch (error) {
    logger.error("Get subscription error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetSubscription);
  }
}

// Delete account
export async function deleteAccount(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { password } = req.body;

    const pool = await getPool();

    // Verify password
    const userResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query("SELECT password FROM Users WHERE id = @userId");

    if (userResult.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }

    const isValid = await bcrypt.compare(
      password,
      userResult.recordset[0].password,
    );

    if (!isValid) {
      sendApiError(res, req, 401, ApiErrors.passwordIncorrect);
      return;
    }

    // Delete user (CASCADE will delete all related data)
    await pool
      .request()
      .input("userId", sql.Int, userId)
      .query("DELETE FROM Users WHERE id = @userId");

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    logger.error("Delete account error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteAccount);
  }
}
