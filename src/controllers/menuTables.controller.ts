import { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";

export async function getTables(req: Request, res: Response): Promise<void> {
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
        FROM MenuTables
        WHERE menuId = @menuId
        ORDER BY id DESC
      `);

    res.json({ tables: result.recordset });
  } catch (error) {
    logger.error("Get menu tables error:", error);
    res.status(500).json({ error: "Failed to get tables" });
  }
}

export async function getTableById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, tableId } = req.params;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("tableId", sql.Int, parseInt(tableId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, userId)
      .query(`
        SELECT t.*
        FROM MenuTables t
        JOIN Menus m ON t.menuId = m.id
        WHERE t.id = @tableId AND t.menuId = @menuId AND m.userId = @userId
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: "Table not found" });
      return;
    }

    res.json({ table: result.recordset[0] });
  } catch (error) {
    logger.error("Get table by ID error:", error);
    res.status(500).json({ error: "Failed to get table" });
  }
}

export async function createTable(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;
    const { tableNumber, seats, isActive = true } = req.body;

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
      .input("tableNumber", sql.NVarChar, tableNumber)
      .input("seats", sql.Int, seats || null)
      .input("isActive", sql.Bit, isActive ? 1 : 0)
      .query(`
        INSERT INTO MenuTables (menuId, tableNumber, seats, isActive)
        OUTPUT INSERTED.*
        VALUES (@menuId, @tableNumber, @seats, @isActive)
      `);

    res.status(201).json({
      message: "Table created successfully",
      table: result.recordset[0],
    });
  } catch (error) {
    logger.error("Create table error:", error);
    res.status(500).json({ error: "Failed to create table" });
  }
}

export async function updateTable(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, tableId } = req.params;
    const { tableNumber, seats, isActive } = req.body;

    const pool = await getPool();

    const checkResult = await pool
      .request()
      .input("tableId", sql.Int, parseInt(tableId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, userId)
      .query(`
        SELECT t.id
        FROM MenuTables t
        JOIN Menus m ON t.menuId = m.id
        WHERE t.id = @tableId AND t.menuId = @menuId AND m.userId = @userId
      `);

    if (checkResult.recordset.length === 0) {
      res.status(404).json({ error: "Table not found" });
      return;
    }

    const updates: string[] = [];
    const request = pool
      .request()
      .input("tableId", sql.Int, parseInt(tableId));

    if (tableNumber !== undefined) {
      updates.push("tableNumber = @tableNumber");
      request.input("tableNumber", sql.NVarChar, tableNumber);
    }
    if (seats !== undefined) {
      updates.push("seats = @seats");
      request.input("seats", sql.Int, seats);
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
      UPDATE MenuTables
      SET ${updates.join(", ")}
      WHERE id = @tableId
    `);

    res.json({ message: "Table updated successfully" });
  } catch (error) {
    logger.error("Update table error:", error);
    res.status(500).json({ error: "Failed to update table" });
  }
}

export async function deleteTable(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, tableId } = req.params;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("tableId", sql.Int, parseInt(tableId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, userId)
      .query(`
        DELETE t
        FROM MenuTables t
        JOIN Menus m ON t.menuId = m.id
        WHERE t.id = @tableId AND t.menuId = @menuId AND m.userId = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: "Table not found" });
      return;
    }

    res.json({ message: "Table deleted successfully" });
  } catch (error) {
    logger.error("Delete table error:", error);
    res.status(500).json({ error: "Failed to delete table" });
  }
}
