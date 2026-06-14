import { getPool, sql } from "../config/database";
import { ensureAdminActivityLogSchema } from "../schemas/adminActivityLog.schema";

export type AdminActivityTargetType = "admin" | "user";

export type AdminActivityAction =
  | "admin_created"
  | "admin_deleted"
  | "admin_permissions_updated"
  | "user_deleted"
  | "user_soft_deleted"
  | "user_restored"
  | "user_subscription_updated";

export async function logAdminActivity(params: {
  actorAdminId: number | null;
  actorAdminName: string;
  action: AdminActivityAction;
  targetType: AdminActivityTargetType;
  targetId: number;
  targetName: string;
  targetEmail?: string | null;
  details?: string | null;
}): Promise<void> {
  await ensureAdminActivityLogSchema();
  const pool = await getPool();
  await pool
    .request()
    .input("actorAdminId", sql.Int, params.actorAdminId)
    .input(
      "actorAdminName",
      sql.NVarChar(255),
      params.actorAdminName.slice(0, 255),
    )
    .input("action", sql.NVarChar(100), params.action)
    .input("targetType", sql.NVarChar(20), params.targetType)
    .input("targetId", sql.Int, params.targetId)
    .input("targetName", sql.NVarChar(255), params.targetName.slice(0, 255))
    .input("targetEmail", sql.NVarChar(255), params.targetEmail ?? null)
    .input("details", sql.NVarChar(sql.MAX), params.details ?? null)
    .query(`
      INSERT INTO AdminActivityLog (
        actorAdminId, actorAdminName, action, targetType,
        targetId, targetName, targetEmail, details
      )
      VALUES (
        @actorAdminId, @actorAdminName, @action, @targetType,
        @targetId, @targetName, @targetEmail, @details
      )
    `);
}

export async function listAdminActivityLog(options: {
  page?: number;
  limit?: number;
  action?: string;
  targetType?: AdminActivityTargetType;
}): Promise<{
  entries: Array<{
    id: number;
    actorAdminId: number | null;
    actorAdminName: string;
    action: string;
    targetType: string;
    targetId: number;
    targetName: string;
    targetEmail: string | null;
    details: string | null;
    createdAt: Date;
  }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}> {
  await ensureAdminActivityLogSchema();
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;

  const pool = await getPool();
  const where: string[] = ["1=1"];

  const applyFilters = (
    request: ReturnType<typeof pool.request>,
  ): ReturnType<typeof pool.request> => {
    if (options.action) {
      request.input("action", sql.NVarChar(100), options.action);
    }
    if (options.targetType) {
      request.input("targetType", sql.NVarChar(20), options.targetType);
    }
    return request;
  };

  if (options.action) {
    where.push("action = @action");
  }
  if (options.targetType) {
    where.push("targetType = @targetType");
  }

  const whereClause = where.join(" AND ");

  const rowsRequest = applyFilters(pool.request());
  rowsRequest.input("limit", sql.Int, limit);
  rowsRequest.input("offset", sql.Int, offset);

  const countRequest = applyFilters(pool.request());

  const [rowsResult, countResult] = await Promise.all([
    rowsRequest.query(`
      SELECT
        id, actorAdminId, actorAdminName, action, targetType,
        targetId, targetName, targetEmail, details, createdAt
      FROM AdminActivityLog
      WHERE ${whereClause}
      ORDER BY createdAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `),
    countRequest.query(`
      SELECT COUNT(*) AS total
      FROM AdminActivityLog
      WHERE ${whereClause}
    `),
  ]);

  const totalItems = Number(countResult.recordset[0]?.total ?? 0);

  return {
    entries: rowsResult.recordset.map((row) => ({
      id: Number(row.id),
      actorAdminId: row.actorAdminId != null ? Number(row.actorAdminId) : null,
      actorAdminName: String(row.actorAdminName),
      action: String(row.action),
      targetType: String(row.targetType),
      targetId: Number(row.targetId),
      targetName: String(row.targetName),
      targetEmail: row.targetEmail != null ? String(row.targetEmail) : null,
      details: row.details != null ? String(row.details) : null,
      createdAt: row.createdAt,
    })),
    pagination: {
      currentPage: page,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      totalItems,
      itemsPerPage: limit,
    },
  };
}

export async function getUserSnapshot(
  userId: number,
): Promise<{ name: string; email: string; role: string } | null> {
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT name, email, role FROM Users WHERE id = @userId
  `);
  if (!result.recordset.length) return null;
  const row = result.recordset[0];
  return {
    name: String(row.name),
    email: String(row.email),
    role: String(row.role),
  };
}
