import { Request, Response } from "express";
import { getPool, sql } from "../config/database";

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
        SELECT a.id 
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

    // Update ad
    await pool
      .request()
      .input("adId", sql.Int, adId)
      .input("title", sql.NVarChar, title)
      .input("titleAr", sql.NVarChar, titleAr)
      .input("content", sql.NVarChar, content)
      .input("contentAr", sql.NVarChar, contentAr)
      .input("imageUrl", sql.NVarChar, imageUrl)
      .input("linkUrl", sql.NVarChar, linkUrl)
      .input("position", sql.NVarChar, position)
      .input("isActive", sql.Bit, isActive !== undefined ? isActive : true)
      .query(`
        UPDATE Ads
        SET 
          title = @title,
          titleAr = @titleAr,
          content = @content,
          contentAr = @contentAr,
          imageUrl = @imageUrl,
          linkUrl = @linkUrl,
          position = @position,
          isActive = @isActive
        WHERE id = @adId
      `);

    res.json({
      success: true,
      message: "Ad updated successfully",
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
        SELECT a.id 
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
        SELECT a.id, a.isActive 
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

    const currentStatus = adCheck.recordset[0].isActive;

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

    res.json({
      success: true,
      message: "Ad status updated successfully",
      data: {
        isActive: !currentStatus,
      },
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

