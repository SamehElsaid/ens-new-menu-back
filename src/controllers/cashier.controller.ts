import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { body, param } from "express-validator";
import { getPool, sql, executeTransaction } from "../config/database";
import { validate } from "../middleware/validation";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { ROLES } from "../config/constants";
import {
  isValidCashierPageKey,
  cashierMenuBelongsToOwner,
} from "../services/cashier.service";

function uniqueInts(ids: unknown[]): number[] {
  const s = new Set<number>();
  for (const x of ids) {
    const n = typeof x === "number" ? x : parseInt(String(x), 10);
    if (Number.isFinite(n) && n > 0) s.add(n);
  }
  return [...s];
}

function normalizePageKeys(keys: unknown[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const str = String(k ?? "").trim();
    if (isValidCashierPageKey(str) && !out.includes(str)) out.push(str);
  }
  return out;
}

/** GET /api/user/cashiers */
export async function listCashiers(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user!.userId;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("ownerId", sql.Int, ownerId)
      .input("cashierRole", sql.NVarChar, ROLES.CASHIER).query(`
      SELECT u.id, u.email, u.name, u.phoneNumber, u.isEmailVerified, u.createdAt, u.isSuspended
      FROM Users u
      WHERE u.ownerUserId = @ownerId AND u.role = @cashierRole
      ORDER BY u.id DESC
    `);
    const rows = result.recordset as Record<string, unknown>[];
    const cashiers = [];
    for (const row of rows) {
      const cid = row.id as number;
      const [menus, pages] = await Promise.all([
        pool
          .request()
          .input("uid", sql.Int, cid)
          .query(
            `SELECT menuId FROM UserMenuPermission WHERE userId = @uid`,
          ),
        pool
          .request()
          .input("uid", sql.Int, cid)
          .query(
            `SELECT pageKey FROM UserDashboardPagePermission WHERE userId = @uid`,
          ),
      ]);
      cashiers.push({
        ...row,
        menuIds: (menus.recordset as { menuId: number }[]).map((m) => m.menuId),
        pageKeys: (pages.recordset as { pageKey: string }[]).map((p) => p.pageKey),
      });
    }

    res.json({ cashiers });
  } catch (error) {
    logger.error("listCashiers error:", error);
    sendApiError(res, req, 500, ApiErrors.internalServerError);
  }
}

/** POST /api/user/cashiers */
export async function createCashier(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user!.userId;
    const { email, password, name, phoneNumber, menuIds, pageKeys } = req.body;

    const menus = uniqueInts(Array.isArray(menuIds) ? menuIds : []);
    let pages = normalizePageKeys(Array.isArray(pageKeys) ? pageKeys : []);
    if (!pages.includes("overview")) {
      pages = ["overview", ...pages];
    }

    if (menus.length === 0) {
      sendApiError(res, req, 400, {
        en: "Select at least one menu.",
        ar: "اختر منيو واحداً على الأقل.",
      });
      return;
    }
    if (pages.length === 0) {
      sendApiError(res, req, 400, {
        en: "Select at least one dashboard page permission.",
        ar: "اختر صلاحية صفحة واحدة على الأقل.",
      });
      return;
    }

    for (const mid of menus) {
      const ok = await cashierMenuBelongsToOwner(ownerId, mid);
      if (!ok) {
        sendApiError(res, req, 400, {
          en: "One or more menus are not owned by you.",
          ar: "واحد أو أكثر من المنيوهات لا يخصك.",
        });
        return;
      }
    }

    const pool = await getPool();
    const emailLower = String(email).toLowerCase().trim();

    const dup = await pool
      .request()
      .input("email", sql.NVarChar, emailLower)
      .query(`SELECT id FROM Users WHERE email = @email`);
    if (dup.recordset.length > 0) {
      sendApiError(res, req, 400, ApiErrors.emailAlreadyRegistered);
      return;
    }

    const hashed = await bcrypt.hash(String(password), 12);

    const outId = await executeTransaction(async (tx) => {
      const ins = await tx
        .request()
        .input("email", sql.NVarChar, emailLower)
        .input("password", sql.NVarChar, hashed)
        .input("name", sql.NVarChar, String(name).trim())
        .input("phone", sql.NVarChar, phoneNumber ? String(phoneNumber) : null)
        .input("ownerId", sql.Int, ownerId)
        .input("role", sql.NVarChar, ROLES.CASHIER).query(`
        INSERT INTO Users (email, password, name, phoneNumber, role, ownerUserId, isEmailVerified)
        OUTPUT INSERTED.id
        VALUES (@email, @password, @name, @phone, @role, @ownerId, 1)
      `);

      const cashierId = ins.recordset[0].id as number;

      for (const mid of menus) {
        await tx
          .request()
          .input("cid", sql.Int, cashierId)
          .input("menuId", sql.Int, mid)
          .query(`
          INSERT INTO UserMenuPermission (userId, menuId)
          VALUES (@cid, @menuId)
        `);
      }
      for (const pk of pages) {
        await tx
          .request()
          .input("cid", sql.Int, cashierId)
          .input("pk", sql.NVarChar(64), pk)
          .query(`
          INSERT INTO UserDashboardPagePermission (userId, pageKey)
          VALUES (@cid, @pk)
        `);
      }
      return cashierId;
    });

    res.status(201).json({ message: "Cashier created", cashierId: outId });
  } catch (error) {
    logger.error("createCashier error:", error);
    sendApiError(res, req, 500, ApiErrors.internalServerError);
  }
}

/** PATCH /api/user/cashiers/:cashierId */
export async function updateCashier(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user!.userId;
    const cashierId = parseInt(req.params.cashierId, 10);
    if (!Number.isFinite(cashierId)) {
      sendApiError(res, req, 400, ApiErrors.validationFailed);
      return;
    }

    const { name, phoneNumber, password, menuIds, pageKeys, isActive } =
      req.body;

    const pool = await getPool();

    const chk = await pool
      .request()
      .input("cid", sql.Int, cashierId)
      .input("ownerId", sql.Int, ownerId)
      .input("cr", sql.NVarChar, ROLES.CASHIER)
      .query(
        `SELECT id FROM Users WHERE id = @cid AND ownerUserId = @ownerId AND role = @cr`,
      );

    if (chk.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }

    await executeTransaction(async (tx) => {
      const updates: string[] = [];
      const rq = tx.request().input("cid", sql.Int, cashierId);
      if (name !== undefined) {
        updates.push("name = @name");
        rq.input("name", sql.NVarChar, String(name).trim());
      }
      if (phoneNumber !== undefined) {
        updates.push("phoneNumber = @phoneNumber");
        rq.input("phoneNumber", sql.NVarChar, phoneNumber ? String(phoneNumber) : null);
      }
      if (typeof isActive === "boolean") {
        updates.push("isSuspended = @sus");
        rq.input("sus", sql.Bit, isActive ? 0 : 1);
      }
      if (password !== undefined && String(password).length >= 6) {
        const hashed = await bcrypt.hash(String(password), 12);
        updates.push("password = @password");
        rq.input("password", sql.NVarChar, hashed);
      }
      if (updates.length > 0) {
        await rq.query(`UPDATE Users SET ${updates.join(", ")} WHERE id = @cid`);
      }

      if (Array.isArray(menuIds)) {
        const menus = uniqueInts(menuIds);
        if (menus.length === 0) {
          throw new Error("EMPTY_MENUS");
        }
        for (const mid of menus) {
          const ok = await cashierMenuBelongsToOwner(ownerId, mid);
          if (!ok) {
            throw new Error("INVALID_MENU");
          }
        }
        await tx
          .request()
          .input("cid", sql.Int, cashierId)
          .query(`DELETE FROM UserMenuPermission WHERE userId = @cid`);
        for (const mid of menus) {
          await tx
            .request()
            .input("cid", sql.Int, cashierId)
            .input("mid", sql.Int, mid)
            .query(
              `INSERT INTO UserMenuPermission (userId, menuId) VALUES (@cid, @mid)`,
            );
        }
      }

      if (Array.isArray(pageKeys)) {
        let pages = normalizePageKeys(pageKeys);
        if (pages.length > 0 && !pages.includes("overview")) {
          pages = ["overview", ...pages];
        }
        await tx
          .request()
          .input("cid", sql.Int, cashierId)
          .query(`DELETE FROM UserDashboardPagePermission WHERE userId = @cid`);
        for (const pk of pages) {
          await tx
            .request()
            .input("cid", sql.Int, cashierId)
            .input("pk", sql.NVarChar(64), pk)
            .query(
              `INSERT INTO UserDashboardPagePermission (userId, pageKey) VALUES (@cid, @pk)`,
            );
        }
      }
    });

    res.json({ message: "Cashier updated" });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "INVALID_MENU") {
      sendApiError(res, req, 400, {
        en: "Invalid menu selection.",
        ar: "اختيار منيو غير صالح.",
      });
      return;
    }
    if (error instanceof Error && error.message === "EMPTY_MENUS") {
      sendApiError(res, req, 400, {
        en: "Select at least one menu.",
        ar: "اختر منيو واحداً على الأقل.",
      });
      return;
    }
    logger.error("updateCashier error:", error);
    sendApiError(res, req, 500, ApiErrors.internalServerError);
  }
}

/** DELETE /api/user/cashiers/:cashierId */
export async function deleteCashier(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user!.userId;
    const cashierId = parseInt(req.params.cashierId, 10);

    const pool = await getPool();
    const del = await pool
      .request()
      .input("cid", sql.Int, cashierId)
      .input("ownerId", sql.Int, ownerId)
      .input("cr", sql.NVarChar, ROLES.CASHIER)
      .query(
        `DELETE FROM Users WHERE id = @cid AND ownerUserId = @ownerId AND role = @cr`,
      );

    if (del.rowsAffected[0] === 0) {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }

    res.json({ message: "Cashier deleted" });
  } catch (error) {
    logger.error("deleteCashier error:", error);
    sendApiError(res, req, 500, ApiErrors.internalServerError);
  }
}

export const cashierValidators = {
  create: validate([
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6, max: 128 }),
    body("name").trim().notEmpty().isLength({ max: 255 }),
    body("phoneNumber").optional().isString().trim().isLength({ max: 50 }),
    body("menuIds").isArray({ min: 1 }),
    body("pageKeys").isArray({ min: 1 }),
  ]),
  patch: validate([
    param("cashierId").isInt(),
    body("name").optional().trim().isLength({ max: 255 }),
    body("phoneNumber").optional().isString().trim().isLength({ max: 50 }),
    body("password").optional().isLength({ min: 6, max: 128 }),
    body("menuIds").optional().isArray(),
    body("pageKeys").optional().isArray(),
    body("isActive").optional().isBoolean(),
  ]),
  one: validate([param("cashierId").isInt()]),
};
