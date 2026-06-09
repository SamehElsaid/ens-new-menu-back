import { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { logMenuActivitySafe } from "../services/menuActivityLog.service";

// Create menu ad
export const createMenuAd = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;
    const { title, titleAr, content, contentAr, imageUrl, linkUrl, position } = req.body;

    const pool = await getPool();

    // Verify menu belongs to user
    const menuCheck = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("userId", sql.Int, userId)
      .query(`
        SELECT id FROM Menus WHERE id = @menuId AND userId = @userId
      `);

    if (menuCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu not found or you don't have permission",
      });
    }

    // Create ad
    const result = await pool
      .request()
      .input("title", sql.NVarChar, title)
      .input("titleAr", sql.NVarChar, titleAr)
      .input("content", sql.NVarChar, content)
      .input("contentAr", sql.NVarChar, contentAr)
      .input("imageUrl", sql.NVarChar, imageUrl || null)
      .input("linkUrl", sql.NVarChar, linkUrl || null)
      .input("position", sql.NVarChar, position || "banner")
      .input("adType", sql.NVarChar, "menu")
      .input("menuId", sql.Int, menuId)
      .query(`
        INSERT INTO Ads (
          title, titleAr, content, contentAr, imageUrl, linkUrl, 
          position, adType, menuId, isActive, displayOrder,
          impressionCount, clickCount, createdAt
        )
        OUTPUT INSERTED.id
        VALUES (
          @title, @titleAr, @content, @contentAr, @imageUrl, @linkUrl,
          @position, @adType, @menuId, 1, 0,
          0, 0, GETDATE()
        )
      `);

    const adId = result.recordset[0].id;

    res.status(201).json({
      success: true,
      message: "Ad created successfully",
      data: {
        adId,
      },
    });
    const mid = parseInt(String(menuId), 10);
    const titleLabelAr = String(titleAr ?? title ?? "").trim() || "إعلان";
    const titleLabelEn = String(title ?? titleAr ?? "").trim() || "Ad";
    void logMenuActivitySafe(req, mid, {
      action: "AD_CREATED",
      targetType: "ad",
      targetId: adId,
      summaryAr: `إضافة إعلان: ${titleLabelAr}`,
      summaryEn: `Added ad: ${titleLabelEn}`,
    });
  } catch (error: any) {
    console.error("Error creating ad:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create ad",
      error: error.message,
    });
  }
};

// Get menu ads
export const getMenuAds = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

    const pool = await getPool();

    // Verify menu belongs to user
    const menuCheck = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("userId", sql.Int, userId)
      .query(`
        SELECT id FROM Menus WHERE id = @menuId AND userId = @userId
      `);

    if (menuCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Menu not found or you don't have permission",
      });
    }

    // Count total ads
    const countResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query(`
        SELECT COUNT(*) as total
        FROM Ads
        WHERE menuId = @menuId AND adType = 'menu'
      `);

    const total = countResult.recordset[0]?.total ?? 0;

    // Get menu ads with pagination
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("offset", sql.Int, (page - 1) * limit)
      .input("limit", sql.Int, limit)
      .query(`
        SELECT 
          id, title, titleAr, content, contentAr, imageUrl, linkUrl,
          position, displayOrder, isActive, adType, menuId,
          impressionCount, clickCount, createdAt
        FROM Ads
        WHERE menuId = @menuId AND adType = 'menu'
        ORDER BY displayOrder ASC, createdAt DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        ads: result.recordset,
        pagination: {
          total: Number(total),
          page,
          limit,
          totalPages,
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching menu ads:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ads",
      error: error.message,
    });
  }
};

// Update ad
export const updateAd = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { adId } = req.params;
    const { title, titleAr, content, contentAr, imageUrl, linkUrl, position, isActive } = req.body;

    const pool = await getPool();

    // Verify ad belongs to user's menu
    const adCheck = await pool
      .request()
      .input("adId", sql.Int, adId)
      .input("userId", sql.Int, userId)
      .query(`
        SELECT a.id, a.menuId, a.title, a.titleAr
        FROM Ads a
        INNER JOIN Menus m ON a.menuId = m.id
        WHERE a.id = @adId AND m.userId = @userId AND a.adType = 'menu'
      `);

    if (adCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ad not found or you don't have permission",
      });
    }

    const menuIdForLog = adCheck.recordset[0].menuId as number;

    const updates: string[] = [];
    const inputs: Record<string, unknown> = { adId: parseInt(String(adId), 10) };

    if (title !== undefined) {
      updates.push("title = @title");
      inputs.title = title;
    }
    if (titleAr !== undefined) {
      updates.push("titleAr = @titleAr");
      inputs.titleAr = titleAr;
    }
    if (content !== undefined) {
      updates.push("content = @content");
      inputs.content = content;
    }
    if (contentAr !== undefined) {
      updates.push("contentAr = @contentAr");
      inputs.contentAr = contentAr;
    }
    if (imageUrl !== undefined) {
      updates.push("imageUrl = @imageUrl");
      inputs.imageUrl = imageUrl;
    }
    if (linkUrl !== undefined) {
      updates.push("linkUrl = @linkUrl");
      inputs.linkUrl = linkUrl;
    }
    if (position !== undefined) {
      updates.push("position = @position");
      inputs.position = position;
    }
    if (isActive !== undefined) {
      updates.push("isActive = @isActive");
      inputs.isActive = isActive;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    const request = pool.request();
    for (const [key, value] of Object.entries(inputs)) {
      if (key === "adId") {
        request.input(key, sql.Int, value);
      } else if (key === "isActive") {
        request.input(key, sql.Bit, value);
      } else {
        request.input(key, sql.NVarChar, value);
      }
    }

    await request.query(`
      UPDATE Ads
      SET ${updates.join(", ")}
      WHERE id = @adId
    `);

    const titlesAfter = await pool
      .request()
      .input("adId", sql.Int, adId)
      .query(
        `SELECT title, titleAr FROM Ads WHERE id = @adId AND adType = N'menu'`,
      );
    const tr = titlesAfter.recordset[0] as
      | { title?: string | null; titleAr?: string | null }
      | undefined;
    const labelAr = String(tr?.titleAr ?? "").trim() || String(tr?.title ?? "").trim() || "إعلان";
    const labelEn = String(tr?.title ?? "").trim() || String(tr?.titleAr ?? "").trim() || "Ad";

    res.json({
      success: true,
      message: "Ad updated successfully",
    });
    void logMenuActivitySafe(req, menuIdForLog, {
      action: "AD_UPDATED",
      targetType: "ad",
      targetId: parseInt(String(adId), 10),
      summaryAr: `تعديل إعلان: ${labelAr}`,
      summaryEn: `Updated ad: ${labelEn}`,
    });
  } catch (error: any) {
    console.error("Error updating ad:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update ad",
      error: error.message,
    });
  }
};

// Delete ad
export const deleteAd = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { adId } = req.params;

    const pool = await getPool();

    // Verify ad belongs to user's menu
    const adCheck = await pool
      .request()
      .input("adId", sql.Int, adId)
      .input("userId", sql.Int, userId)
      .query(`
        SELECT a.id, a.menuId, a.title, a.titleAr
        FROM Ads a
        INNER JOIN Menus m ON a.menuId = m.id
        WHERE a.id = @adId AND m.userId = @userId AND a.adType = 'menu'
      `);

    if (adCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ad not found or you don't have permission",
      });
    }

    const menuIdForLog = adCheck.recordset[0].menuId as number;
    const rowAd = adCheck.recordset[0] as {
      title?: string | null;
      titleAr?: string | null;
    };
    const labelAr =
      String(rowAd.titleAr ?? "").trim() ||
      String(rowAd.title ?? "").trim() ||
      "إعلان";
    const labelEn =
      String(rowAd.title ?? "").trim() ||
      String(rowAd.titleAr ?? "").trim() ||
      "Ad";

    // Delete ad
    await pool
      .request()
      .input("adId", sql.Int, adId)
      .query(`
        DELETE FROM Ads WHERE id = @adId
      `);

    res.json({
      success: true,
      message: "Ad deleted successfully",
    });
    void logMenuActivitySafe(req, menuIdForLog, {
      action: "AD_DELETED",
      targetType: "ad",
      targetId: parseInt(String(adId), 10),
      summaryAr: `حذف إعلان: ${labelAr}`,
      summaryEn: `Deleted ad: ${labelEn}`,
    });
  } catch (error: any) {
    console.error("Error deleting ad:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete ad",
      error: error.message,
    });
  }
};

// Toggle ad status
export const toggleAdStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { adId } = req.params;

    const pool = await getPool();

    // Verify ad belongs to user's menu
    const adCheck = await pool
      .request()
      .input("adId", sql.Int, adId)
      .input("userId", sql.Int, userId)
      .query(`
        SELECT a.id, a.isActive, a.menuId, a.title, a.titleAr
        FROM Ads a
        INNER JOIN Menus m ON a.menuId = m.id
        WHERE a.id = @adId AND m.userId = @userId AND a.adType = 'menu'
      `);

    if (adCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ad not found or you don't have permission",
      });
    }

    const rowT = adCheck.recordset[0] as {
      isActive: boolean;
      menuId: number;
      title?: string | null;
      titleAr?: string | null;
    };
    const currentStatus = rowT.isActive;
    const menuIdForLog = rowT.menuId as number;
    const adLabelAr =
      String(rowT.titleAr ?? "").trim() ||
      String(rowT.title ?? "").trim() ||
      "إعلان";
    const adLabelEn =
      String(rowT.title ?? "").trim() ||
      String(rowT.titleAr ?? "").trim() ||
      "Ad";

    // Toggle status
    await pool
      .request()
      .input("adId", sql.Int, adId)
      .input("newStatus", sql.Bit, !currentStatus)
      .query(`
        UPDATE Ads
        SET isActive = @newStatus
        WHERE id = @adId
      `);

    const newActive = !currentStatus;
    res.json({
      success: true,
      message: "Ad status updated successfully",
      data: {
        isActive: newActive,
      },
    });
    void logMenuActivitySafe(req, menuIdForLog, {
      action: "AD_STATUS_TOGGLED",
      targetType: "ad",
      targetId: parseInt(String(adId), 10),
      summaryAr: newActive
        ? `تفعيل إعلان: ${adLabelAr}`
        : `إيقاف إعلان: ${adLabelAr}`,
      summaryEn: newActive
        ? `Enabled ad: ${adLabelEn}`
        : `Disabled ad: ${adLabelEn}`,
    });
  } catch (error: any) {
    console.error("Error toggling ad status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle ad status",
      error: error.message,
    });
  }
};

