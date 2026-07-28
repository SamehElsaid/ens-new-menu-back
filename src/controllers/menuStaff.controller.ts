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
import { logMenuActivitySafe } from "../services/menuActivityLog.service";
import { getMenuAccessForRequest } from "../utils/menuAccess";
import { localizedRoleNameSql } from "../services/menuStaffRoles.service";
import { getLocaleFromAcceptLanguage } from "../utils/localeHelper";
import {
  findStaffEmailConflict,
  type StaffEmailConflict,
} from "../services/staffEmail.service";

/** Staff-management endpoints: owner OR a staff member whose role grants it. */
const STAFF_MANAGE_PERMISSION = "staff:manage";

/** Ensures a roleId exists on the menu owner's account catalog. */
async function resolveMenuRole(
  menuId: number,
  roleId: unknown,
  locale: string,
): Promise<
  | { ok: true; roleId: number; roleName: string; legacyRole: string }
  | { ok: false }
> {
  const rid =
    roleId == null || roleId === "" ? NaN : parseInt(String(roleId), 10);
  if (!Number.isFinite(rid) || rid <= 0) return { ok: false };

  const pool = await getPool();
  const check = await pool
    .request()
    .input("roleId", sql.Int, rid)
    .input("menuId", sql.Int, menuId)
    .input("locale", sql.NVarChar(5), locale)
    .query(`
      SELECT r.id, ${localizedRoleNameSql("r", "name")}, r.permissionsJson
      FROM dbo.MenuStaffRoles r
      INNER JOIN dbo.Menus m ON m.userId = r.ownerUserId
      WHERE r.id = @roleId AND m.id = @menuId
    `);
  if (check.recordset.length === 0) return { ok: false };

  // Legacy `role` text kept in sync for backward-compatible reads until the
  // column is dropped in phase 4: dashboard access ⇒ cashier, otherwise waiter.
  let legacyRole = "waiter";
  try {
    const perms = JSON.parse(String(check.recordset[0].permissionsJson ?? "[]"));
    if (Array.isArray(perms) && perms.includes("dashboard:access")) {
      legacyRole = "cashier";
    }
  } catch {
    /* keep default */
  }

  return {
    ok: true,
    roleId: rid,
    roleName: String(check.recordset[0].name),
    legacyRole,
  };
}

function isSqlUniqueViolation(error: unknown): boolean {
  const err = error as { number?: number };
  // 2627 unique constraint, 2601 unique index
  return err?.number === 2627 || err?.number === 2601;
}

function staffEmailConflictError(conflict: Exclude<StaffEmailConflict, null>) {
  return conflict === "owner"
    ? ApiErrors.staffEmailBelongsToOwner
    : ApiErrors.staffEmailExists;
}

export async function getStaff(req: Request, res: Response): Promise<void> {
  try {
    const { menuId } = req.params;

    const access = await getMenuAccessForRequest(
      req,
      parseInt(menuId, 10),
      STAFF_MANAGE_PERMISSION,
    );
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const pool = await getPool();
    const meta = await getMenuStaffColumnMeta();

    const result = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("locale", sql.NVarChar(5), getLocaleFromAcceptLanguage(req))
      .query(`
        SELECT s.*, ${localizedRoleNameSql("r", "roleName")}
        FROM MenuStaff s
        INNER JOIN dbo.MenuStaffGrants g ON g.staffId = s.id AND g.menuId = @menuId
        LEFT JOIN dbo.MenuStaffRoles r ON r.id = s.roleId
        ORDER BY s.id DESC
      `);

    const staff = (result.recordset as Record<string, unknown>[]).map((row) =>
      normalizeStaffRow(row, meta),
    );

    res.json({ staff });
  } catch (error) {
    logger.error("Get menu staff error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListStaff);
  }
}

export async function getStaffById(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId, staffId } = req.params;

    const access = await getMenuAccessForRequest(
      req,
      parseInt(menuId, 10),
      STAFF_MANAGE_PERMISSION,
    );
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const pool = await getPool();
    const meta = await getMenuStaffColumnMeta();

    const result = await pool
      .request()
      .input("staffId", sql.Int, parseInt(staffId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, access.ownerUserId)
      .input("locale", sql.NVarChar(5), getLocaleFromAcceptLanguage(req))
      .query(`
        SELECT s.*, ${localizedRoleNameSql("r", "roleName")}
        FROM MenuStaff s
        JOIN Menus m ON s.menuId = m.id
        LEFT JOIN dbo.MenuStaffRoles r ON r.id = s.roleId
        WHERE s.id = @staffId AND s.menuId = @menuId AND m.userId = @userId
      `);

    if (result.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    res.json({
      staff: normalizeStaffRow(
        result.recordset[0] as Record<string, unknown>,
        meta,
      ),
    });
  } catch (error) {
    logger.error("Get staff by ID error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetStaffMember);
  }
}

export async function createStaff(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId } = req.params;
    const { name, roleId, phone, email, password, isActive = true } = req.body;

    const access = await getMenuAccessForRequest(
      req,
      parseInt(menuId, 10),
      STAFF_MANAGE_PERMISSION,
    );
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const pool = await getPool();
    const meta = await getMenuStaffColumnMeta();

    const resolvedRole = await resolveMenuRole(
      parseInt(menuId, 10),
      roleId,
      getLocaleFromAcceptLanguage(req),
    );
    if (!resolvedRole.ok) {
      sendApiError(res, req, 400, ApiErrors.invalidRoleId);
      return;
    }

    if (password && !meta.passwordKey) {
      sendApiError(res, req, 400, ApiErrors.passwordColumnNotConfigured);
      return;
    }

    const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
    if (password && !normalizedEmail) {
      sendApiError(res, req, 400, ApiErrors.staffPasswordRequiresEmail);
      return;
    }

    if (normalizedEmail && meta.emailKey) {
      const conflict = await findStaffEmailConflict(normalizedEmail);
      if (conflict) {
        sendApiError(res, req, 400, staffEmailConflictError(conflict));
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

    if (meta.roleIdColumnQuoted) {
      cols.push(meta.roleIdColumnQuoted);
      vals.push("@roleId");
      insertReq.input("roleId", sql.Int, resolvedRole.roleId);
    }

    if (meta.roleColumnQuoted) {
      cols.push(meta.roleColumnQuoted);
      vals.push("@legacyRole");
      insertReq.input("legacyRole", sql.NVarChar, resolvedRole.legacyRole);
    }

    if (meta.phoneColumnQuoted) {
      cols.push(meta.phoneColumnQuoted);
      vals.push("@phone");
      insertReq.input("phone", sql.NVarChar, phone ?? null);
    }

    if (meta.emailKey) {
      cols.push(quoteMenuStaffIdent(meta.emailKey));
      vals.push("@email");
      insertReq.input("email", sql.NVarChar, normalizedEmail);
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
    staffOut.roleId = resolvedRole.roleId;
    staffOut.roleName = resolvedRole.roleName;
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
    if (isSqlUniqueViolation(error)) {
      sendApiError(res, req, 400, ApiErrors.staffEmailExists);
      return;
    }
    logger.error("Create staff error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateStaffMember);
  }
}

export async function updateStaff(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId, staffId } = req.params;
    const { name, roleId, phone, email, password, isActive } = req.body;

    const access = await getMenuAccessForRequest(
      req,
      parseInt(menuId, 10),
      STAFF_MANAGE_PERMISSION,
    );
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    const pool = await getPool();
    const meta = await getMenuStaffColumnMeta();

    const checkResult = await pool
      .request()
      .input("staffId", sql.Int, parseInt(staffId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, access.ownerUserId)
      .query(`
        SELECT s.*
        FROM MenuStaff s
        JOIN Menus m ON s.menuId = m.id
        WHERE s.id = @staffId AND s.menuId = @menuId AND m.userId = @userId
      `);

    if (checkResult.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    const existing = checkResult.recordset[0] as Record<string, unknown>;
    const updates: string[] = [];
    const request = pool.request().input("staffId", sql.Int, parseInt(staffId));

    if (name !== undefined) {
      updates.push(`${quoteMenuStaffIdent(meta.nameKey)} = @name`);
      request.input("name", sql.NVarChar, name);
    }
    if (roleId !== undefined && meta.roleIdColumnQuoted) {
      const resolvedRole = await resolveMenuRole(
        parseInt(menuId, 10),
        roleId,
        getLocaleFromAcceptLanguage(req),
      );
      if (!resolvedRole.ok) {
        sendApiError(res, req, 400, ApiErrors.invalidRoleId);
        return;
      }
      updates.push(`${meta.roleIdColumnQuoted} = @roleId`);
      request.input("roleId", sql.Int, resolvedRole.roleId);
      if (meta.roleColumnQuoted) {
        updates.push(`${meta.roleColumnQuoted} = @legacyRole`);
        request.input("legacyRole", sql.NVarChar, resolvedRole.legacyRole);
      }
    }
    if (phone !== undefined && meta.phoneColumnQuoted) {
      updates.push(`${meta.phoneColumnQuoted} = @phone`);
      request.input("phone", sql.NVarChar, phone || null);
    }

    let nextEmail: string | null | undefined;
    if (email !== undefined && meta.emailKey) {
      nextEmail = email ? String(email).toLowerCase().trim() : null;
      if (nextEmail) {
        const conflict = await findStaffEmailConflict(
          nextEmail,
          parseInt(staffId, 10),
        );
        if (conflict) {
          sendApiError(res, req, 400, staffEmailConflictError(conflict));
          return;
        }
      }
      updates.push(`${quoteMenuStaffIdent(meta.emailKey)} = @email`);
      request.input("email", sql.NVarChar, nextEmail);
    }

    if (password !== undefined) {
      if (!meta.passwordKey) {
        sendApiError(res, req, 400, ApiErrors.passwordColumnNotConfigured);
        return;
      }
      const existingEmail =
        meta.emailKey && existing[meta.emailKey] != null
          ? String(existing[meta.emailKey]).trim()
          : "";
      const emailAfterUpdate =
        nextEmail !== undefined ? nextEmail : existingEmail || null;
      if (!emailAfterUpdate) {
        sendApiError(res, req, 400, ApiErrors.staffPasswordRequiresEmail);
        return;
      }
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
    const staffLabel =
      String(
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
    if (isSqlUniqueViolation(error)) {
      sendApiError(res, req, 400, ApiErrors.staffEmailExists);
      return;
    }
    logger.error("Update staff error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateStaffMember);
  }
}

export async function deleteStaff(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId, staffId } = req.params;

    const access = await getMenuAccessForRequest(
      req,
      parseInt(menuId, 10),
      STAFF_MANAGE_PERMISSION,
    );
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    const pool = await getPool();
    const meta = await getMenuStaffColumnMeta();
    const nameCol = quoteMenuStaffIdent(meta.nameKey);

    const pre = await pool
      .request()
      .input("staffId", sql.Int, parseInt(staffId, 10))
      .input("menuId", sql.Int, parseInt(menuId, 10))
      .input("userId", sql.Int, access.ownerUserId)
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

    const staffLabel =
      String(
        (pre.recordset[0] as { staffName?: unknown }).staffName ?? "",
      ).trim() || "موظف";

    const result = await pool
      .request()
      .input("staffId", sql.Int, parseInt(staffId))
      .input("menuId", sql.Int, parseInt(menuId))
      .input("userId", sql.Int, access.ownerUserId)
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
