import { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { getMenuAccessForRequest } from "../utils/menuAccess";
import { ensureRatingsSchema } from "../schemas/ratings.schema";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logger } from "../utils/logger";

/**
 * GET /api/menus/:menuId/ratings?page=1&limit=12&q=
 * Owner / cashier staff: full ratings list including optional contact fields.
 */
export async function listMenuRatingsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const mid = parseInt(String(req.params.menuId), 10);
    if (!Number.isFinite(mid) || mid <= 0) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const access = await getMenuAccessForRequest(req, mid, "analytics:view");
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    await ensureRatingsSchema();

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "12"), 10) || 12),
    );
    const qRaw = req.query.q ?? req.query.search;
    const search =
      typeof qRaw === "string" && qRaw.trim() ? qRaw.trim().slice(0, 100) : "";

    const pool = await getPool();

    const countRequest = pool
      .request()
      .input("menuId", sql.Int, mid);
    const listRequest = pool
      .request()
      .input("menuId", sql.Int, mid)
      .input("offset", sql.Int, (page - 1) * limit)
      .input("limit", sql.Int, limit);

    let whereClause = "WHERE menuId = @menuId";
    if (search) {
      countRequest.input("q", sql.NVarChar(100), search);
      listRequest.input("q", sql.NVarChar(100), search);
      whereClause += `
        AND (
          ISNULL(customerName, N'') LIKE N'%' + @q + N'%'
          OR ISNULL(customerPhone, N'') LIKE N'%' + @q + N'%'
          OR ISNULL(customerEmail, N'') LIKE N'%' + @q + N'%'
          OR ISNULL(comment, N'') LIKE N'%' + @q + N'%'
        )`;
    }

    const countResult = await countRequest.query(`
      SELECT
        COUNT(*) AS total,
        AVG(CAST(stars AS FLOAT)) AS average
      FROM Ratings
      ${whereClause}
    `);

    const total = Number(countResult.recordset[0]?.total ?? 0);
    const average = Number(countResult.recordset[0]?.average ?? 0);

    const listResult = await listRequest.query(`
      SELECT
        id,
        stars,
        comment,
        customerName,
        customerPhone,
        customerEmail,
        createdAt
      FROM Ratings
      ${whereClause}
      ORDER BY createdAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    res.json({
      success: true,
      data: {
        ratings: listResult.recordset,
        summary: {
          total,
          average: total > 0 ? Math.round(average * 10) / 10 : 0,
        },
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
      },
    });
  } catch (error) {
    logger.error("listMenuRatingsHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetRatings);
  }
}
