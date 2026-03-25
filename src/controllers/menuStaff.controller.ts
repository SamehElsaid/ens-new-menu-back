import { Request, Response } from "express";
import bcrypt from "bcryptjs";
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
        SELECT id, menuId, name, role, phone, email, isActive, createdAt
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
        SELECT s.id, s.menuId, s.name, s.role, s.phone, s.email, s.isActive, s.createdAt
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
    const { name, role, phone, email, password, isActive = true } = req.body;

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

    if (email) {
      const dupCheck = await pool
        .request()
        .input("email", sql.NVarChar, email.toLowerCase())
        .input("menuId", sql.Int, parseInt(menuId))
        .query(
          "SELECT id FROM MenuStaff WHERE email = @email AND menuId = @menuId"
        );
      if (dupCheck.recordset.length > 0) {
        res
          .status(400)
          .json({ error: "Email already exists for this menu" });
        return;
      }
    }

    const hashedPassword = password
      ? await bcrypt.hash(password, 12)
      : null;

    const result = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("name", sql.NVarChar, name)
      .input("role", sql.NVarChar, role || null)
      .input("phone", sql.NVarChar, phone || null)
      .input("email", sql.NVarChar, email ? email.toLowerCase() : null)
      .input("password", sql.NVarChar, hashedPassword)
      .input("isActive", sql.Bit, isActive ? 1 : 0)
      .query(`
        INSERT INTO MenuStaff (menuId, name, role, phone, email, password, isActive)
        OUTPUT INSERTED.id, INSERTED.menuId, INSERTED.name, INSERTED.role,
               INSERTED.phone, INSERTED.email, INSERTED.isActive, INSERTED.createdAt
        VALUES (@menuId, @name, @role, @phone, @email, @password, @isActive)
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
    const { name, role, phone, email, password, isActive } = req.body;

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
      request.input("email", sql.NVarChar, email ? email.toLowerCase() : null);
    }
    if (password !== undefined) {
      updates.push("password = @password");
      const hashed = await bcrypt.hash(password, 12);
      request.input("password", sql.NVarChar, hashed);
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
