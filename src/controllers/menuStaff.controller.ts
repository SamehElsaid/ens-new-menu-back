import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getPool, sql } from "../config/database";
import {
  getMenuStaffColumnMeta,
  normalizeStaffRow,
  quoteMenuStaffIdent,
} from "../config/menuStaffColumns";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import {
  parseStaffJobRoleOrError,
  STAFF_JOB_WAITER,
} from "../config/staffJobRoles";
import { logMenuActivitySafe } from "../services/menuActivityLog.service";

async function isStaffEmailTaken(
  email: string,
  excludeStaffId?: number,
): Promise<boolean> {
  const meta = await getMenuStaffColumnMeta();
  if (!meta.emailKey) {
    return false;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) {
    return false;
  }

  const pool = await getPool();
  const request = pool
    .request()
    .input("email", sql.NVarChar, normalizedEmail);
  const excludeSql =
    excludeStaffId != null ? " AND id <> @excludeStaffId" : "";
  if (excludeStaffId != null) {
    request.input("excludeStaffId", sql.Int, excludeStaffId);
  }

  const dupCheck = await request.query(`
      SELECT TOP 1 id
      FROM MenuStaff
      WHERE ${quoteMenuStaffIdent(meta.emailKey)} = @email${excludeSql}
    `);

  return dupCheck.recordset.length > 0;
}

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
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
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
    sendApiError(res, req, 500, ApiErrors.failedListStaff);
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
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
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
    sendApiError(res, req, 500, ApiErrors.failedGetStaffMember);
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
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    if (password && !meta.passwordKey) {
      sendApiError(res, req, 400, ApiErrors.passwordColumnNotConfigured);
      return;
    }

    if (email && meta.emailKey) {
      if (await isStaffEmailTaken(String(email))) {
        sendApiError(res, req, 400, ApiErrors.staffEmailExists);
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
      const raw = role ?? STAFF_JOB_WAITER;
      const parsed = parseStaffJobRoleOrError(raw);
      if (!parsed.ok) {
        sendApiError(res, req, 400, ApiErrors.invalidStaffJobRole);
        return;
      }
      cols.push(meta.roleColumnQuoted);
      vals.push("@role");
      insertReq.input("role", sql.NVarChar, parsed.value);
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
    } else if (req.body?.isActive === false) {
      sendApiError(res, req, 500, ApiErrors.staffActiveStatusUnsupported);
      return;
    }

    const insertSql = `
        INSERT INTO MenuStaff (${cols.join(", ")})
        OUTPUT INSERTED.*
        VALUES (${vals.join(", ")})
      `;

    const result = await insertReq.query(insertSql);

    const staffOut = normalizeStaffRow(
      result.recordset[0] as Record<string, unknown>,
      meta,
    );
    res.status(201).json({
      message: "Staff member created successfully",
      staff: staffOut,
    });
    void logMenuActivitySafe(req, parseInt(menuId, 10), {
      action: "STAFF_CREATED",
      targetType: "staff",
      targetId: Number(staffOut.id),
      summaryAr: `إضافة موظف: ${String(staffOut.name ?? name)}`,
      summaryEn: `Added staff: ${String(staffOut.name ?? name)}`,
    });
  } catch (error) {
    logger.error("Create staff error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateStaffMember);
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
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    const updates: string[] = [];
    const request = pool.request().input("staffId", sql.Int, parseInt(staffId));

    if (name !== undefined) {
      updates.push(`${quoteMenuStaffIdent(meta.nameKey)} = @name`);
      request.input("name", sql.NVarChar, name);
    }
    if (role !== undefined && meta.roleColumnQuoted) {
      const parsed = parseStaffJobRoleOrError(role);
      if (!parsed.ok) {
        sendApiError(res, req, 400, ApiErrors.invalidStaffJobRole);
        return;
      }
      updates.push(`${meta.roleColumnQuoted} = @role`);
      request.input("role", sql.NVarChar, parsed.value);
    }
    if (phone !== undefined && meta.phoneColumnQuoted) {
      updates.push(`${meta.phoneColumnQuoted} = @phone`);
      request.input("phone", sql.NVarChar, phone || null);
    }
    if (email !== undefined && meta.emailKey) {
      const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
      if (
        normalizedEmail &&
        (await isStaffEmailTaken(normalizedEmail, parseInt(staffId, 10)))
      ) {
        sendApiError(res, req, 400, ApiErrors.staffEmailExists);
        return;
      }
      updates.push(`${quoteMenuStaffIdent(meta.emailKey)} = @email`);
      request.input("email", sql.NVarChar, normalizedEmail);
    }
    if (password !== undefined && meta.passwordKey) {
      updates.push(`${quoteMenuStaffIdent(meta.passwordKey)} = @password`);
      const hashed = await bcrypt.hash(password, 12);
      request.input("password", sql.NVarChar, hashed);
    }
    if (isActive !== undefined && !meta.activeColumnQuoted) {
      sendApiError(res, req, 500, ApiErrors.staffActiveStatusUnsupported);
      return;
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
      UPDATE MenuStaff
      SET ${updates.join(", ")}
      WHERE id = @staffId
    `);

    const nameCol = quoteMenuStaffIdent(meta.nameKey);
    const nameRes = await pool
      .request()
      .input("staffId", sql.Int, parseInt(staffId, 10))
      .query(
        `SELECT ${nameCol} AS staffName FROM MenuStaff WHERE id = @staffId`,
      );
    const staffLabel = String(
      (nameRes.recordset[0] as { staffName?: unknown } | undefined)
        ?.staffName ?? "",
    ).trim() || "موظف";

    res.json({ message: "Staff member updated successfully" });
    void logMenuActivitySafe(req, parseInt(menuId, 10), {
      action: "STAFF_UPDATED",
      targetType: "staff",
      targetId: parseInt(staffId, 10),
      summaryAr: `تعديل بيانات: ${staffLabel}`,
      summaryEn: `Updated staff: ${staffLabel}`,
    });
  } catch (error) {
    logger.error("Update staff error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateStaffMember);
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
    const meta = await getMenuStaffColumnMeta();
    const nameCol = quoteMenuStaffIdent(meta.nameKey);

    const pre = await pool
      .request()
      .input("staffId", sql.Int, parseInt(staffId, 10))
      .input("menuId", sql.Int, parseInt(menuId, 10))
      .input("userId", sql.Int, userId)
      .query(`
        SELECT ${nameCol} AS staffName
        FROM MenuStaff s
        JOIN Menus m ON s.menuId = m.id
        WHERE s.id = @staffId AND s.menuId = @menuId AND m.userId = @userId
      `);

    if (pre.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    const staffLabel = String(
      (pre.recordset[0] as { staffName?: unknown }).staffName ?? "",
    ).trim() || "موظف";

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
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    res.json({ message: "Staff member deleted successfully" });
    void logMenuActivitySafe(req, parseInt(menuId, 10), {
      action: "STAFF_DELETED",
      targetType: "staff",
      targetId: parseInt(staffId, 10),
      summaryAr: `حذف موظف: ${staffLabel}`,
      summaryEn: `Deleted staff: ${staffLabel}`,
    });
  } catch (error) {
    logger.error("Delete staff error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteStaffMember);
  }
}
