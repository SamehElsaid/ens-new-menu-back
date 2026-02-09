import { Request, Response, NextFunction } from "express";
import { getPool, sql } from "../config/database";
import { PLANS } from "../config/constants";

export async function checkMenuLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const pool = await getPool();

    // Get user's subscription (get the most recent active subscription by id)
    const subResult = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT TOP 1 s.planId, p.maxMenus, p.name as planName
        FROM Subscriptions s
        JOIN Plans p ON s.planId = p.id
        WHERE s.userId = @userId 
          AND s.status = 'active' 
          AND (s.endDate IS NULL OR s.endDate > GETDATE())
        ORDER BY s.id DESC
      `);

    if (subResult.recordset.length === 0) {
      res.status(403).json({
        error: "No active subscription found. Please subscribe to a plan.",
      });
      return;
    }

    const { maxMenus, planName } = subResult.recordset[0];

    // Count user's active menus only (inactive menus don't count towards limit)
    const countResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query(
        "SELECT COUNT(*) as count FROM Menus WHERE userId = @userId AND isActive = 1"
      );

    const currentCount = countResult.recordset[0].count;

    if (currentCount >= maxMenus) {
      res.status(403).json({
        error: `You have reached the maximum number of menus (${maxMenus}) for your ${planName} plan.`,
        currentCount,
        maxMenus,
        planName,
      });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: "Failed to check menu limit" });
  }
}

export async function checkProductLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const menuId = parseInt(req.params.menuId);
    const pool = await getPool();

    // Get menu's plan limit (get the most recent active subscription by id)
    const planResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("menuId", sql.Int, menuId).query(`
        SELECT TOP 1 p.maxProductsPerMenu, p.name as planName
        FROM Menus m
        JOIN Subscriptions s ON m.userId = s.userId 
          AND s.status = 'active' 
          AND (s.endDate IS NULL OR s.endDate > GETDATE())
        JOIN Plans p ON s.planId = p.id
        WHERE m.id = @menuId AND m.userId = @userId
        ORDER BY s.id DESC
      `);

    if (planResult.recordset.length === 0) {
      res.status(404).json({ error: "Menu not found or access denied" });
      return;
    }

    const { maxProductsPerMenu, planName } = planResult.recordset[0];

    // -1 means unlimited
    if (maxProductsPerMenu === -1) {
      next();
      return;
    }

    // Count menu's products
    const countResult = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query("SELECT COUNT(*) as count FROM MenuItems WHERE menuId = @menuId");

    const currentCount = countResult.recordset[0].count;

    if (currentCount >= maxProductsPerMenu) {
      res.status(403).json({
        error: `You have reached the maximum number of products (${maxProductsPerMenu}) for your ${planName} plan.`,
        currentCount,
        maxProductsPerMenu,
        planName,
      });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: "Failed to check product limit" });
  }
}
