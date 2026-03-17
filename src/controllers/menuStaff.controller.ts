import { Request, Response } from "express";
import { getPool, sql, executeTransaction } from "../config/database";
import { logger } from "../utils/logger";

export async function getStaff(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;

    const pool = await getPool();

    const menuCheck = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, userId)
      .query("SELECT id FROM Menus WHERE id = @menuId AND userId = @userId");

    if (menuCheck.recordset.length === 0) {
      res.status(404).json({ error: "Menu not found" });
      return;
    }

    const result = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .query(`
        SELECT *
        FROM MenuStaff
        WHERE menuId = @menuId
        ORDER BY id DESC
      `);

    res.json({ staff: result.recordset });
  } catch (error) {
    logger.error("Get menu staff error:", error);
    res.status(500).json({ error: "Failed to get staff" });
  }
}

export async function getStaffById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, staffId } = req.params;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("staffId", sql.Int, parseInt(staffId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, userId)
      .query(`
        SELECT s.*
        FROM MenuStaff s
        JOIN Menus m ON s.menuId = m.id
        WHERE s.id = @staffId AND s.menuId = @menuId AND m.userId = @userId
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    res.json({ staff: result.recordset[0] });
  } catch (error) {
    logger.error("Get staff by ID error:", error);
    res.status(500).json({ error: "Failed to get staff member" });
  }
}

export async function createStaff(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;
    const { name, role, phone, email, isActive = true } = req.body;

    const pool = await getPool();

    const menuCheck = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, userId)
      .query("SELECT id FROM Menus WHERE id = @menuId AND userId = @userId");

    if (menuCheck.recordset.length === 0) {
      res.status(404).json({ error: "Menu not found" });
      return;
    }

    const result = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("name", sql.NVarChar, name)
      .input("role", sql.NVarChar, role || null)
      .input("phone", sql.NVarChar, phone || null)
      .input("email", sql.NVarChar, email || null)
      .input("isActive", sql.Bit, isActive ? 1 : 0)
      .query(`
        INSERT INTO MenuStaff (menuId, name, role, phone, email, isActive)
        OUTPUT INSERTED.*
        VALUES (@menuId, @name, @role, @phone, @email, @isActive)
      `);

    res.status(201).json({
      message: "Staff member created successfully",
      staff: result.recordset[0],
    });
  } catch (error) {
    logger.error("Create staff error:", error);
    res.status(500).json({ error: "Failed to create staff member" });
  }
}

export async function updateStaff(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, staffId } = req.params;
    const { name, role, phone, email, isActive } = req.body;

    const pool = await getPool();

    const checkResult = await pool
      .request()
      .input("staffId", sql.Int, parseInt(staffId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, userId)
      .query(`
        SELECT s.id
        FROM MenuStaff s
        JOIN Menus m ON s.menuId = m.id
        WHERE s.id = @staffId AND s.menuId = @menuId AND m.userId = @userId
      `);

    if (checkResult.recordset.length === 0) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    const updates: string[] = [];
    const request = pool.request().input("staffId", sql.Int, parseInt(staffId));

    if (name !== undefined) {
      updates.push("name = @name");
      request.input("name", sql.NVarChar, name);
    }
    if (role !== undefined) {
      updates.push("role = @role");
      request.input("role", sql.NVarChar, role || null);
    }
    if (phone !== undefined) {
      updates.push("phone = @phone");
      request.input("phone", sql.NVarChar, phone || null);
    }
    if (email !== undefined) {
      updates.push("email = @email");
      request.input("email", sql.NVarChar, email || null);
    }
    if (isActive !== undefined) {
      updates.push("isActive = @isActive");
      request.input("isActive", sql.Bit, isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    await request.query(`
      UPDATE MenuStaff
      SET ${updates.join(", ")}
      WHERE id = @staffId
    `);

    res.json({ message: "Staff member updated successfully" });
  } catch (error) {
    logger.error("Update staff error:", error);
    res.status(500).json({ error: "Failed to update staff member" });
  }
}

export async function deleteStaff(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, staffId } = req.params;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("staffId", sql.Int, parseInt(staffId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, userId)
      .query(`
        DELETE s
        FROM MenuStaff s
        JOIN Menus m ON s.menuId = m.id
        WHERE s.id = @staffId AND s.menuId = @menuId AND m.userId = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    res.json({ message: "Staff member deleted successfully" });
  } catch (error) {
    logger.error("Delete staff error:", error);
    res.status(500).json({ error: "Failed to delete staff member" });
  }
}
