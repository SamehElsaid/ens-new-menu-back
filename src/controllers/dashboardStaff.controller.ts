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
import { authorization } from "../services/authorization.service";
import { actorFromRequest } from "../middleware/requireStaffPermission";
import {
  filterMenuIdsOwnedBy,
  listGrantsForStaffIds,
  listStaffGrantedMenuIds,
  resolveOwnerUserId,
  setStaffMenuGrants,
} from "../services/staffMenuGrants.service";
import {
  getRoleForOwner,
  localizedRoleNameSql,
  roleDisplayName,
} from "../services/menuStaffRoles.service";
import { getLocaleFromAcceptLanguage } from "../utils/localeHelper";
import { logAccountStaffActivity } from "../services/accountStaffAudit.service";
import {
  findStaffEmailConflict,
  type StaffEmailConflict,
} from "../services/staffEmail.service";

const STAFF_MANAGE_PERMISSION = "staff:manage";

/**
 * Resolves the account the request acts on and verifies the actor may manage
 * its staff. Owners manage their own account; staff need `staff:manage`.
 */
async function resolveStaffAdminContext(
  req: Request,
): Promise<{ ok: true; ownerUserId: number } | { ok: false }> {
  const actor = actorFromRequest(req);
  if (!actor) return { ok: false };
  if (!(await authorization.can(actor, STAFF_MANAGE_PERMISSION))) {
    return { ok: false };
  }

  const auth = req.user!;
  const ownerUserId = await resolveOwnerUserId({
    userId: auth.userId,
    role: auth.role,
  });
  if (ownerUserId == null) return { ok: false };
  return { ok: true, ownerUserId };
}

function isSqlUniqueViolation(error: unknown): boolean {
  const err = error as { number?: number };
  return err?.number === 2627 || err?.number === 2601;
}

function staffEmailConflictError(conflict: Exclude<StaffEmailConflict, null>) {
  return conflict === "owner"
    ? ApiErrors.staffEmailBelongsToOwner
    : ApiErrors.staffEmailExists;
}

/** Menu ids from the request body, keeping only menus this account owns. */
async function resolveRequestedGrants(
  ownerUserId: number,
  raw: unknown,
): Promise<number[]> {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((value) => parseInt(String(value), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
  return filterMenuIdsOwnedBy(ownerUserId, ids);
}

/** Staff row scoped to the account, or null when it belongs elsewhere. */
async function getAccountStaffRow(
  ownerUserId: number,
  staffId: number,
  locale: string,
): Promise<Record<string, unknown> | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("staffId", sql.Int, staffId)
    .input("ownerUserId", sql.Int, ownerUserId)
    .input("locale", sql.NVarChar(5), locale)
    .query(`
      SELECT TOP 1 s.*, ${localizedRoleNameSql("r", "roleName")}
      FROM MenuStaff s
      LEFT JOIN dbo.MenuStaffRoles r ON r.id = s.roleId
      LEFT JOIN dbo.Menus m ON m.id = s.menuId
      WHERE s.id = @staffId
        AND COALESCE(s.ownerUserId, m.userId) = @ownerUserId
    `);
  return (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
}

function staffLabel(staff: Record<string, unknown>, fallback = "موظف"): string {
  const value = staff.name;
  const text = value != null ? String(value).trim() : "";
  return text || fallback;
}

/**
 * GET /api/dashboard/staff
 * Every staff member on the account, each with the menus they may work on.
 */
export async function listAccountStaffHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }

    const pool = await getPool();
    const meta = await getMenuStaffColumnMeta();
    const result = await pool
      .request()
      .input("ownerUserId", sql.Int, context.ownerUserId)
      .input("locale", sql.NVarChar(5), getLocaleFromAcceptLanguage(req))
      .query(`
        SELECT s.*, ${localizedRoleNameSql("r", "roleName")}
        FROM MenuStaff s
        LEFT JOIN dbo.MenuStaffRoles r ON r.id = s.roleId
        LEFT JOIN dbo.Menus m ON m.id = s.menuId
        WHERE COALESCE(s.ownerUserId, m.userId) = @ownerUserId
        ORDER BY s.id DESC
      `);

    const rows = result.recordset as Record<string, unknown>[];
    const grants = await listGrantsForStaffIds(rows.map((r) => Number(r.id)));

    const staff = rows.map((row) => {
      const normalized = normalizeStaffRow(row, meta);
      return {
        ...normalized,
        menuIds: grants.get(Number(row.id)) ?? [],
      };
    });

    res.json({ staff });
  } catch (error) {
    logger.error("listAccountStaffHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedListStaff);
  }
}

/** GET /api/dashboard/staff/:staffId */
export async function getAccountStaffByIdHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }

    const staffId = parseInt(req.params.staffId, 10);
    const row = await getAccountStaffRow(
      context.ownerUserId,
      staffId,
      getLocaleFromAcceptLanguage(req),
    );
    if (!row) {
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    const meta = await getMenuStaffColumnMeta();
    res.json({
      staff: {
        ...normalizeStaffRow(row, meta),
        menuIds: await listStaffGrantedMenuIds(staffId),
      },
    });
  } catch (error) {
    logger.error("getAccountStaffByIdHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetStaffMember);
  }
}

/**
 * POST /api/dashboard/staff
 * Body: { name, roleId, email, password, phone?, isActive?, menuIds: number[] }
 */
export async function createAccountStaffHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }
    const { ownerUserId } = context;

    const { name, roleId, phone, email, password, isActive = true } = req.body;

    const role = await getRoleForOwner(
      ownerUserId,
      parseInt(String(roleId), 10),
    );
    if (!role) {
      sendApiError(res, req, 400, ApiErrors.invalidRoleId);
      return;
    }

    const menuIds = await resolveRequestedGrants(ownerUserId, req.body?.menuIds);
    if (menuIds.length === 0) {
      sendApiError(res, req, 400, ApiErrors.staffMenuGrantsRequired);
      return;
    }

    const meta = await getMenuStaffColumnMeta();
    if (password && !meta.passwordKey) {
      sendApiError(res, req, 400, ApiErrors.passwordColumnNotConfigured);
      return;
    }

    const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
    if (password && !normalizedEmail) {
      sendApiError(res, req, 400, ApiErrors.staffPasswordRequiresEmail);
      return;
    }
    if (normalizedEmail) {
      const conflict = await findStaffEmailConflict(normalizedEmail);
      if (conflict) {
        sendApiError(res, req, 400, staffEmailConflictError(conflict));
        return;
      }
    }

    const pool = await getPool();
    // `menuId` stays as a legacy anchor; grants are the real access list.
    const cols: string[] = [
      "menuId",
      "ownerUserId",
      quoteMenuStaffIdent(meta.nameKey),
    ];
    const vals: string[] = ["@menuId", "@ownerUserId", "@name"];
    const insertReq = pool
      .request()
      .input("menuId", sql.Int, menuIds[0])
      .input("ownerUserId", sql.Int, ownerUserId)
      .input("name", sql.NVarChar, name);

    if (meta.roleIdColumnQuoted) {
      cols.push(meta.roleIdColumnQuoted);
      vals.push("@roleId");
      insertReq.input("roleId", sql.Int, role.id);
    }
    if (meta.roleColumnQuoted) {
      cols.push(meta.roleColumnQuoted);
      vals.push("@legacyRole");
      insertReq.input(
        "legacyRole",
        sql.NVarChar,
        role.permissions.includes("dashboard:access") ? "cashier" : "waiter",
      );
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
      insertReq.input(
        "password",
        sql.NVarChar,
        password ? await bcrypt.hash(password, 12) : null,
      );
    }
    if (meta.activeColumnQuoted) {
      cols.push(meta.activeColumnQuoted);
      vals.push("@isActive");
      insertReq.input("isActive", sql.Bit, isActive ? 1 : 0);
    } else if (req.body?.isActive === false) {
      sendApiError(res, req, 500, ApiErrors.staffActiveStatusUnsupported);
      return;
    }

    const inserted = await insertReq.query(`
      INSERT INTO MenuStaff (${cols.join(", ")})
      OUTPUT INSERTED.*
      VALUES (${vals.join(", ")})
    `);

    const created = normalizeStaffRow(
      inserted.recordset[0] as Record<string, unknown>,
      meta,
    );
    const staffId = Number(created.id);
    const grants = await setStaffMenuGrants(staffId, menuIds);

    res.status(201).json({
      message: "Staff member created successfully",
      staff: {
        ...created,
        roleId: role.id,
        roleName: roleDisplayName(role, getLocaleFromAcceptLanguage(req)),
        menuIds: grants,
      },
    });

    void logAccountStaffActivity(req, ownerUserId, grants, {
      action: "STAFF_CREATED",
      targetType: "staff",
      targetId: staffId,
      summaryAr: `إضافة موظف: ${staffLabel(created, String(name))}`,
      summaryEn: `Added staff: ${staffLabel(created, String(name))}`,
      after: { name, roleId: role.id, roleName: role.name, menuIds: grants },
    });
  } catch (error) {
    if (isSqlUniqueViolation(error)) {
      sendApiError(res, req, 400, ApiErrors.staffEmailExists);
      return;
    }
    logger.error("createAccountStaffHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateStaffMember);
  }
}

/** PUT /api/dashboard/staff/:staffId */
export async function updateAccountStaffHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }
    const { ownerUserId } = context;

    const staffId = parseInt(req.params.staffId, 10);
    const locale = getLocaleFromAcceptLanguage(req);
    const existingRow = await getAccountStaffRow(ownerUserId, staffId, locale);
    if (!existingRow) {
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    const meta = await getMenuStaffColumnMeta();
    const before = normalizeStaffRow(existingRow, meta);
    const grantsBefore = await listStaffGrantedMenuIds(staffId);

    const { name, roleId, phone, email, password, isActive } = req.body;
    const pool = await getPool();
    const updates: string[] = [];
    const request = pool.request().input("staffId", sql.Int, staffId);

    if (name !== undefined) {
      updates.push(`${quoteMenuStaffIdent(meta.nameKey)} = @name`);
      request.input("name", sql.NVarChar, name);
    }

    let nextRoleName: string | null = null;
    if (roleId !== undefined && meta.roleIdColumnQuoted) {
      const role = await getRoleForOwner(
        ownerUserId,
        parseInt(String(roleId), 10),
      );
      if (!role) {
        sendApiError(res, req, 400, ApiErrors.invalidRoleId);
        return;
      }
      nextRoleName = roleDisplayName(role, locale);
      updates.push(`${meta.roleIdColumnQuoted} = @roleId`);
      request.input("roleId", sql.Int, role.id);
      if (meta.roleColumnQuoted) {
        updates.push(`${meta.roleColumnQuoted} = @legacyRole`);
        request.input(
          "legacyRole",
          sql.NVarChar,
          role.permissions.includes("dashboard:access") ? "cashier" : "waiter",
        );
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
        const conflict = await findStaffEmailConflict(nextEmail, staffId);
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
        before.email != null ? String(before.email).trim() : "";
      const emailAfterUpdate =
        nextEmail !== undefined ? nextEmail : existingEmail || null;
      if (!emailAfterUpdate) {
        sendApiError(res, req, 400, ApiErrors.staffPasswordRequiresEmail);
        return;
      }
      updates.push(`${quoteMenuStaffIdent(meta.passwordKey)} = @password`);
      request.input("password", sql.NVarChar, await bcrypt.hash(password, 12));
    }

    if (isActive !== undefined) {
      if (!meta.activeColumnQuoted) {
        sendApiError(res, req, 500, ApiErrors.staffActiveStatusUnsupported);
        return;
      }
      updates.push(`${meta.activeColumnQuoted} = @isActive`);
      request.input("isActive", sql.Bit, isActive ? 1 : 0);
    }

    let grantsAfter = grantsBefore;
    const grantsProvided = req.body?.menuIds !== undefined;
    if (grantsProvided) {
      const requested = await resolveRequestedGrants(
        ownerUserId,
        req.body.menuIds,
      );
      if (requested.length === 0) {
        sendApiError(res, req, 400, ApiErrors.staffMenuGrantsRequired);
        return;
      }
      grantsAfter = requested;
    }

    if (updates.length === 0 && !grantsProvided) {
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
      return;
    }

    if (updates.length > 0) {
      await request.query(`
        UPDATE MenuStaff SET ${updates.join(", ")} WHERE id = @staffId
      `);
    }

    if (grantsProvided) {
      grantsAfter = await setStaffMenuGrants(staffId, grantsAfter);
      // Keep the legacy anchor pointing at a menu the staff can still reach.
      await pool
        .request()
        .input("staffId", sql.Int, staffId)
        .input("menuId", sql.Int, grantsAfter[0])
        .query(`UPDATE MenuStaff SET menuId = @menuId WHERE id = @staffId`);
    }

    const updatedRow = await getAccountStaffRow(ownerUserId, staffId, locale);
    const updated = updatedRow ? normalizeStaffRow(updatedRow, meta) : before;

    res.json({
      message: "Staff member updated successfully",
      staff: { ...updated, menuIds: grantsAfter },
    });

    void logAccountStaffActivity(
      req,
      ownerUserId,
      [...new Set([...grantsBefore, ...grantsAfter])],
      {
        action: "STAFF_UPDATED",
        targetType: "staff",
        targetId: staffId,
        summaryAr: `تعديل بيانات: ${staffLabel(updated)}`,
        summaryEn: `Updated staff: ${staffLabel(updated)}`,
        before: {
          name: before.name,
          roleId: before.roleId,
          roleName: before.roleName,
          isActive: before.isActive,
          menuIds: grantsBefore,
        },
        after: {
          name: updated.name,
          roleId: updated.roleId,
          roleName: nextRoleName ?? updated.roleName,
          isActive: updated.isActive,
          menuIds: grantsAfter,
        },
      },
    );
  } catch (error) {
    if (isSqlUniqueViolation(error)) {
      sendApiError(res, req, 400, ApiErrors.staffEmailExists);
      return;
    }
    logger.error("updateAccountStaffHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateStaffMember);
  }
}

/** DELETE /api/dashboard/staff/:staffId */
export async function deleteAccountStaffHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const context = await resolveStaffAdminContext(req);
    if (!context.ok) {
      sendApiError(res, req, 403, ApiErrors.forbidden);
      return;
    }
    const { ownerUserId } = context;

    const staffId = parseInt(req.params.staffId, 10);
    const row = await getAccountStaffRow(
      ownerUserId,
      staffId,
      getLocaleFromAcceptLanguage(req),
    );
    if (!row) {
      sendApiError(res, req, 404, ApiErrors.staffMemberNotFound);
      return;
    }

    const meta = await getMenuStaffColumnMeta();
    const staff = normalizeStaffRow(row, meta);
    const grantsBefore = await listStaffGrantedMenuIds(staffId);

    const pool = await getPool();
    await setStaffMenuGrants(staffId, []);
    await pool
      .request()
      .input("staffId", sql.Int, staffId)
      .query(`DELETE FROM MenuStaff WHERE id = @staffId`);

    res.json({ message: "Staff member deleted successfully" });

    void logAccountStaffActivity(req, ownerUserId, grantsBefore, {
      action: "STAFF_DELETED",
      targetType: "staff",
      targetId: staffId,
      summaryAr: `حذف موظف: ${staffLabel(staff)}`,
      summaryEn: `Deleted staff: ${staffLabel(staff)}`,
      before: {
        name: staff.name,
        roleId: staff.roleId,
        roleName: staff.roleName,
        menuIds: grantsBefore,
      },
    });
  } catch (error) {
    logger.error("deleteAccountStaffHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteStaffMember);
  }
}

export { resolveStaffAdminContext };
