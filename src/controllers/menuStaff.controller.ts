import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getPool, sql } from "../config/database";
import {
  getMenuStaffColumnMeta,
  normalizeStaffRow,
  quoteMenuStaffIdent,
} from "../config/menuStaffColumns";
import { logger } from "../utils/logger";

export async function getStaff(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;

    const pool = await getPool();
    const meta = await getMenuStaffColumnMeta();

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

    const staff = (result.recordset as Record<string, unknown>[]).map((row) =>
      normalizeStaffRow(row, meta)
    );

    res.json({ staff });
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
    const meta = await getMenuStaffColumnMeta();

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

    res.json({
      staff: normalizeStaffRow(
        result.recordset[0] as Record<string, unknown>,
        meta
      ),
    });
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
    const meta = await getMenuStaffColumnMeta();

    const menuCheck = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, userId)
      .query("SELECT id FROM Menus WHERE id = @menuId AND userId = @userId");

    if (menuCheck.recordset.length === 0) {
      res.status(404).json({ error: "Menu not found" });
      return;
    }

    if (password && !meta.passwordKey) {
      res.status(400).json({
        error: "Password column not configured on MenuStaff table",
      });
      return;
    }

    if (email && meta.emailKey) {
      const dupCheck = await pool
        .request()
        .input("email", sql.NVarChar, email.toLowerCase())
        .input("menuId", sql.Int, parseInt(menuId))
        .query(
          `SELECT id FROM MenuStaff WHERE ${quoteMenuStaffIdent(meta.emailKey)} = @email AND menuId = @menuId`
        );
      if (dupCheck.recordset.length > 0) {
        res.status(400).json({ error: "Email already exists for this menu" });
        return;
      }
    }

    const hashedPassword = password
      ? await bcrypt.hash(password, 12)
      : null;

    const cols: string[] = ["menuId", quoteMenuStaffIdent(meta.nameKey)];
    const vals: string[] = ["@menuId", "@name"];
    const insertReq = pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("name", sql.NVarChar, name);

    if (meta.roleColumnQuoted) {
      cols.push(meta.roleColumnQuoted);
      vals.push("@role");
      insertReq.input("role", sql.NVarChar, role ?? null);
    }

    if (meta.phoneColumnQuoted) {
      cols.push(meta.phoneColumnQuoted);
      vals.push("@phone");
      insertReq.input("phone", sql.NVarChar, phone ?? null);
    }

    if (meta.emailKey) {
      cols.push(quoteMenuStaffIdent(meta.emailKey));
      vals.push("@email");
      insertReq.input(
        "email",
        sql.NVarChar,
        email ? String(email).toLowerCase() : null
      );
    }

    if (meta.passwordKey) {
      cols.push(quoteMenuStaffIdent(meta.passwordKey));
      vals.push("@password");
      insertReq.input("password", sql.NVarChar, hashedPassword);
    }

    if (meta.activeColumnQuoted) {
      cols.push(meta.activeColumnQuoted);
      vals.push("@isActive");
      insertReq.input("isActive", sql.Bit, isActive ? 1 : 0);
    }

    const insertSql = `
        INSERT INTO MenuStaff (${cols.join(", ")})
        OUTPUT INSERTED.*
        VALUES (${vals.join(", ")})
      `;

    const result = await insertReq.query(insertSql);

    res.status(201).json({
      message: "Staff member created successfully",
      staff: normalizeStaffRow(
        result.recordset[0] as Record<string, unknown>,
        meta
      ),
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
    const meta = await getMenuStaffColumnMeta();

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
      updates.push(`${quoteMenuStaffIdent(meta.nameKey)} = @name`);
      request.input("name", sql.NVarChar, name);
    }
    if (role !== undefined && meta.roleColumnQuoted) {
      updates.push(`${meta.roleColumnQuoted} = @role`);
      request.input("role", sql.NVarChar, role || null);
    }
    if (phone !== undefined && meta.phoneColumnQuoted) {
      updates.push(`${meta.phoneColumnQuoted} = @phone`);
      request.input("phone", sql.NVarChar, phone || null);
    }
    if (email !== undefined && meta.emailKey) {
      updates.push(`${quoteMenuStaffIdent(meta.emailKey)} = @email`);
      request.input("email", sql.NVarChar, email ? email.toLowerCase() : null);
    }
    if (password !== undefined && meta.passwordKey) {
      updates.push(`${quoteMenuStaffIdent(meta.passwordKey)} = @password`);
      const hashed = await bcrypt.hash(password, 12);
      request.input("password", sql.NVarChar, hashed);
    }
    if (isActive !== undefined && meta.activeColumnQuoted) {
      updates.push(`${meta.activeColumnQuoted} = @isActive`);
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
