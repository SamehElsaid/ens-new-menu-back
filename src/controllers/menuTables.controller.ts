import { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { getMenuTablesColumnMeta } from "../config/menuTablesColumns";
import { logger } from "../utils/logger";
import { normalizeMenuTableRow } from "../utils/normalizeMenuTableRow";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { getMenuAccessForRequest } from "../utils/menuAccess";
import {
  isValidTableNumber,
  normalizeTableNumber,
} from "../utils/normalizeTableNumber";

async function menuTableNumberExists(
  pool: Awaited<ReturnType<typeof getPool>>,
  menuId: number,
  tableNumber: string,
  excludeTableId?: number,
): Promise<boolean> {
  const request = pool
    .request()
    .input("menuId", sql.Int, menuId)
    .input("tableNumber", sql.NVarChar, tableNumber);

  let query = `
    SELECT TOP 1 id
    FROM MenuTables
    WHERE menuId = @menuId AND tableNumber = @tableNumber
  `;

  if (excludeTableId !== undefined) {
    request.input("excludeTableId", sql.Int, excludeTableId);
    query += " AND id <> @excludeTableId";
  }

  const result = await request.query(query);
  return result.recordset.length > 0;
}

async function requireMenuAccess(
  req: Request,
  res: Response,
  menuId: string,
): Promise<boolean> {
  const access = await getMenuAccessForRequest(req, parseInt(menuId, 10));
  if (!access.ok) {
    sendApiError(res, req, 404, ApiErrors.menuNotFound);
    return false;
  }
  return true;
}

export async function getTables(req: Request, res: Response): Promise<void> {
  try {
    const { menuId } = req.params;

    const pool = await getPool();

    if (!(await requireMenuAccess(req, res, menuId))) return;

    const result = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .query(`
        SELECT *
        FROM MenuTables
        WHERE menuId = @menuId
        ORDER BY id DESC
      `);

    const tables = (result.recordset as Record<string, unknown>[]).map(
      (row) => normalizeMenuTableRow(row),
    );
    res.json({ tables });
  } catch (error) {
    logger.error("Get menu tables error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetTables);
  }
}

export async function getTableById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { menuId, tableId } = req.params;

    const pool = await getPool();

    const access = await getMenuAccessForRequest(req, parseInt(menuId, 10));
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }
    const ownerUserId = access.ownerUserId;

    const result = await pool
      .request()
      .input("tableId", sql.Int, parseInt(tableId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("ownerUserId", sql.Int, ownerUserId)
      .query(`
        SELECT t.*
        FROM MenuTables t
        JOIN Menus m ON t.menuId = m.id
        WHERE t.id = @tableId AND t.menuId = @menuId AND m.userId = @ownerUserId
      `);

    if (result.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.tableNotFound);
      return;
    }

    res.json({
      table: normalizeMenuTableRow(
        result.recordset[0] as Record<string, unknown>,
      ),
    });
  } catch (error) {
    logger.error("Get table by ID error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetTable);
  }
}

export async function createTable(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { menuId } = req.params;
    const { seats, isActive = true } = req.body;
    const tableNumber = normalizeTableNumber(req.body?.tableNumber);

    if (!isValidTableNumber(tableNumber)) {
      sendApiError(res, req, 400, {
        en: "tableNumber must contain letters and/or numbers (max 50 characters)",
        ar: "رمز الطاولة يجب أن يحتوي على أرقام و/أو حروف (حد أقصى 50 حرفًا)",
      });
      return;
    }

    const pool = await getPool();

    if (!(await requireMenuAccess(req, res, menuId))) return;

    const parsedMenuId = parseInt(menuId, 10);
    if (
      await menuTableNumberExists(pool, parsedMenuId, tableNumber)
    ) {
      sendApiError(res, req, 400, ApiErrors.tableNumberAlreadyExists);
      return;
    }

    const meta = await getMenuTablesColumnMeta();
    const { activeColumnQuoted: activeQ, seatsColumnQuoted: seatsQ } = meta;

    if (req.body?.isActive !== undefined && !activeQ) {
      sendApiError(res, req, 500, ApiErrors.tableActiveStatusUnsupported);
      return;
    }

    const insertCols = ["menuId", "tableNumber"];
    const insertVals = ["@menuId", "@tableNumber"];
    const insertReq = pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("tableNumber", sql.NVarChar, tableNumber);

    if (seatsQ) {
      insertCols.push(seatsQ);
      insertVals.push("@seats");
      insertReq.input("seats", sql.Int, seats ?? null);
    }

    if (activeQ) {
      insertCols.push(activeQ);
      insertVals.push("@isActive");
      insertReq.input("isActive", sql.Bit, isActive ? 1 : 0);
    }

    const insertSql = `
        INSERT INTO MenuTables (${insertCols.join(", ")})
        OUTPUT INSERTED.*
        VALUES (${insertVals.join(", ")})
      `;

    const result = await insertReq.query(insertSql);

    res.status(201).json({
      message: "Table created successfully",
      table: normalizeMenuTableRow(result.recordset[0] as Record<string, unknown>),
    });
  } catch (error) {
    logger.error("Create table error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateTable);
  }
}

export async function updateTable(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { menuId, tableId } = req.params;
    const { seats, isActive } = req.body;
    const tableNumber =
      req.body?.tableNumber !== undefined
        ? normalizeTableNumber(req.body.tableNumber)
        : undefined;

    const pool = await getPool();

    const access = await getMenuAccessForRequest(req, parseInt(menuId, 10));
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }
    const ownerUserId = access.ownerUserId;

    if (tableNumber !== undefined && !isValidTableNumber(tableNumber)) {
      sendApiError(res, req, 400, {
        en: "tableNumber must contain letters and/or numbers (max 50 characters)",
        ar: "رمز الطاولة يجب أن يحتوي على أرقام و/أو حروف (حد أقصى 50 حرفًا)",
      });
      return;
    }

    if (
      tableNumber !== undefined &&
      (await menuTableNumberExists(
        pool,
        parseInt(menuId, 10),
        tableNumber,
        parseInt(tableId, 10),
      ))
    ) {
      sendApiError(res, req, 400, ApiErrors.tableNumberAlreadyExists);
      return;
    }

    const checkResult = await pool
      .request()
      .input("tableId", sql.Int, parseInt(tableId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("ownerUserId", sql.Int, ownerUserId)
      .query(`
        SELECT t.id
        FROM MenuTables t
        JOIN Menus m ON t.menuId = m.id
        WHERE t.id = @tableId AND t.menuId = @menuId AND m.userId = @ownerUserId
      `);

    if (checkResult.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.tableNotFound);
      return;
    }

    const updates: string[] = [];
    const request = pool
      .request()
      .input("tableId", sql.Int, parseInt(tableId));

    const meta = await getMenuTablesColumnMeta();

    if (isActive !== undefined && !meta.activeColumnQuoted) {
      sendApiError(res, req, 500, ApiErrors.tableActiveStatusUnsupported);
      return;
    }

    if (tableNumber !== undefined) {
      updates.push("tableNumber = @tableNumber");
      request.input("tableNumber", sql.NVarChar, tableNumber);
    }
    if (seats !== undefined && meta.seatsColumnQuoted) {
      updates.push(`${meta.seatsColumnQuoted} = @seats`);
      request.input("seats", sql.Int, seats);
    }
    if (isActive !== undefined && meta.activeColumnQuoted) {
      updates.push(`${meta.activeColumnQuoted} = @isActive`);
      request.input("isActive", sql.Bit, isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
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
    sendApiError(res, req, 500, ApiErrors.failedUpdateTable);
  }
}

export async function deleteTable(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { menuId, tableId } = req.params;

    const pool = await getPool();

    const access = await getMenuAccessForRequest(req, parseInt(menuId, 10));
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }
    const ownerUserId = access.ownerUserId;

    const result = await pool
      .request()
      .input("tableId", sql.Int, parseInt(tableId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("ownerUserId", sql.Int, ownerUserId)
      .query(`
        DELETE t
        FROM MenuTables t
        JOIN Menus m ON t.menuId = m.id
        WHERE t.id = @tableId AND t.menuId = @menuId AND m.userId = @ownerUserId
      `);

    if (result.rowsAffected[0] === 0) {
      sendApiError(res, req, 404, ApiErrors.tableNotFound);
      return;
    }

    res.json({ message: "Table deleted successfully" });
  } catch (error) {
    logger.error("Delete table error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteTable);
  }
}
