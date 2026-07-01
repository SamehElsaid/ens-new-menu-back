import { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { ensureDeliverySchema } from "../schemas/delivery.schema";
import {
  assertMenuOwnedByUser,
  fetchMenuDeliverySettings,
  getMenuOwnerPhone,
  MENU_DELIVERY_GOVERNORATE_COLUMNS,
} from "../services/menuDelivery.service";

function parseOptionalCoord(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readGovernorateCoords(body: Record<string, unknown>): {
  lat: number | null;
  lan: number | null;
  latProvided: boolean;
  lanProvided: boolean;
} {
  const latProvided = Object.prototype.hasOwnProperty.call(body, "lat");
  const lanProvided =
    Object.prototype.hasOwnProperty.call(body, "lan") ||
    Object.prototype.hasOwnProperty.call(body, "lng");

  return {
    lat: latProvided ? parseOptionalCoord(body.lat) : null,
    lan: lanProvided ? parseOptionalCoord(body.lan ?? body.lng) : null,
    latProvided,
    lanProvided,
  };
}

function parseMenuIdParam(req: Request): number {
  return parseInt(req.params.menuId, 10);
}

async function assertMenuAccess(
  req: Request,
  res: Response,
): Promise<number | null> {
  const menuId = parseMenuIdParam(req);
  const userId = req.user!.userId;
  if (!(await assertMenuOwnedByUser(menuId, userId))) {
    sendApiError(res, req, 404, ApiErrors.menuNotFound);
    return null;
  }
  return menuId;
}

export async function getMenuDeliverySettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = await assertMenuAccess(req, res);
    if (menuId == null) return;

    const settings = await fetchMenuDeliverySettings(menuId);
    res.json(settings);
  } catch (error) {
    logger.error("Get menu delivery settings error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetDeliverySettings);
  }
}

export async function updateMenuDeliverySettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = await assertMenuAccess(req, res);
    if (menuId == null) return;

    const { deliveryOn, deliveryPhone, deliveryWhatsAppOn } = req.body;

    if (
      deliveryOn === undefined &&
      deliveryPhone === undefined &&
      deliveryWhatsAppOn === undefined
    ) {
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
      return;
    }

    await ensureDeliverySchema();
    const pool = await getPool();
    const updates: string[] = [];
    const request = pool.request().input("menuId", sql.Int, menuId);
    const trimmedPhone =
      typeof deliveryPhone === "string" ? deliveryPhone.trim() : "";

    if (deliveryPhone !== undefined) {
      const whatsAppRequired =
        deliveryWhatsAppOn === true ||
        (deliveryWhatsAppOn === undefined && deliveryOn !== false);
      if (!trimmedPhone && whatsAppRequired) {
        sendApiError(res, req, 400, ApiErrors.deliveryPhoneRequired);
        return;
      }
      if (trimmedPhone) {
        updates.push("deliveryPhone = @deliveryPhone");
        request.input("deliveryPhone", sql.NVarChar, trimmedPhone);
      }
    }

    if (deliveryWhatsAppOn !== undefined) {
      updates.push("deliveryWhatsAppOn = @deliveryWhatsAppOn");
      request.input("deliveryWhatsAppOn", sql.Bit, Boolean(deliveryWhatsAppOn));
    }

    if (deliveryOn !== undefined) {
      const enabled = Boolean(deliveryOn);
      updates.push("deliveryOn = @deliveryOn");
      request.input("deliveryOn", sql.Bit, enabled);

      if (enabled) {
        const current = await getMenuOwnerPhone(menuId);
        const resolvedPhone =
          trimmedPhone ||
          current.deliveryPhone ||
          current.phoneNumber ||
          "";

        const whatsAppEnabled =
          deliveryWhatsAppOn !== undefined
            ? Boolean(deliveryWhatsAppOn)
            : undefined;

        if (whatsAppEnabled !== false && !resolvedPhone) {
          sendApiError(res, req, 400, ApiErrors.deliveryPhoneRequired);
          return;
        }

        if (
          resolvedPhone &&
          !updates.includes("deliveryPhone = @deliveryPhone")
        ) {
          updates.push("deliveryPhone = @deliveryPhone");
          request.input("deliveryPhone", sql.NVarChar, resolvedPhone);
        }
      }
    }

    if (deliveryWhatsAppOn === true && deliveryOn !== false) {
      const current = await getMenuOwnerPhone(menuId);
      const resolvedPhone =
        trimmedPhone ||
        current.deliveryPhone ||
        current.phoneNumber ||
        "";

      if (!resolvedPhone) {
        sendApiError(res, req, 400, ApiErrors.deliveryPhoneRequired);
        return;
      }

      if (!updates.includes("deliveryPhone = @deliveryPhone")) {
        updates.push("deliveryPhone = @deliveryPhone");
        request.input("deliveryPhone", sql.NVarChar, resolvedPhone);
      }
    }

    if (updates.length === 0) {
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
      return;
    }

    await request.query(`
      UPDATE Menus
      SET ${updates.join(", ")}
      WHERE id = @menuId
    `);

    const settings = await fetchMenuDeliverySettings(menuId);
    res.json({
      message: "Delivery settings updated successfully",
      ...settings,
    });
  } catch (error) {
    logger.error("Update menu delivery settings error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateDeliverySettings);
  }
}

export async function getMenuDeliveryGovernorates(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = await assertMenuAccess(req, res);
    if (menuId == null) return;

    await ensureDeliverySchema();
    const pool = await getPool();
    const result = await pool.request().input("menuId", sql.Int, menuId).query(`
      SELECT ${MENU_DELIVERY_GOVERNORATE_COLUMNS}
      FROM MenuDeliveryGovernorates
      WHERE menuId = @menuId
      ORDER BY id
    `);

    res.json({ governorates: result.recordset });
  } catch (error) {
    logger.error("Get menu delivery governorates error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetDeliveryGovernorates);
  }
}

export async function createMenuDeliveryGovernorate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = await assertMenuAccess(req, res);
    if (menuId == null) return;

    const { nameAr, nameEn, price } = req.body;
    const { lat, lan } = readGovernorateCoords(req.body);

    await ensureDeliverySchema();
    const pool = await getPool();
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("nameAr", sql.NVarChar, nameAr)
      .input("nameEn", sql.NVarChar, nameEn)
      .input("price", sql.Decimal(10, 2), price)
      .input("lat", sql.Decimal(10, 8), lat)
      .input("lan", sql.Decimal(11, 8), lan)
      .query(`
        INSERT INTO MenuDeliveryGovernorates (menuId, nameAr, nameEn, price, lat, lan)
        OUTPUT INSERTED.id, INSERTED.nameAr, INSERTED.nameEn, INSERTED.price,
               INSERTED.lat, INSERTED.lan, INSERTED.createdAt, INSERTED.updatedAt
        VALUES (@menuId, @nameAr, @nameEn, @price, @lat, @lan)
      `);

    res.status(201).json({ governorate: result.recordset[0] });
  } catch (error) {
    logger.error("Create menu delivery governorate error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateDeliveryGovernorate);
  }
}

export async function updateMenuDeliveryGovernorate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = await assertMenuAccess(req, res);
    if (menuId == null) return;

    const governorateId = parseInt(req.params.governorateId, 10);
    const { nameAr, nameEn, price } = req.body;
    const coords = readGovernorateCoords(req.body);

    await ensureDeliverySchema();
    const pool = await getPool();
    const updates: string[] = ["updatedAt = GETDATE()"];
    const request = pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("governorateId", sql.Int, governorateId);

    if (nameAr !== undefined) {
      updates.push("nameAr = @nameAr");
      request.input("nameAr", sql.NVarChar, nameAr);
    }

    if (nameEn !== undefined) {
      updates.push("nameEn = @nameEn");
      request.input("nameEn", sql.NVarChar, nameEn);
    }

    if (price !== undefined) {
      updates.push("price = @price");
      request.input("price", sql.Decimal(10, 2), price);
    }

    if (coords.latProvided) {
      updates.push("lat = @lat");
      request.input("lat", sql.Decimal(10, 8), coords.lat);
    }

    if (coords.lanProvided) {
      updates.push("lan = @lan");
      request.input("lan", sql.Decimal(11, 8), coords.lan);
    }

    if (updates.length === 1) {
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
      return;
    }

    const result = await request.query(`
      UPDATE MenuDeliveryGovernorates
      SET ${updates.join(", ")}
      OUTPUT INSERTED.id, INSERTED.nameAr, INSERTED.nameEn, INSERTED.price,
             INSERTED.lat, INSERTED.lan, INSERTED.createdAt, INSERTED.updatedAt
      WHERE id = @governorateId AND menuId = @menuId
    `);

    if (result.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.deliveryGovernorateNotFound);
      return;
    }

    res.json({ governorate: result.recordset[0] });
  } catch (error) {
    logger.error("Update menu delivery governorate error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateDeliveryGovernorate);
  }
}

export async function deleteMenuDeliveryGovernorate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const menuId = await assertMenuAccess(req, res);
    if (menuId == null) return;

    const governorateId = parseInt(req.params.governorateId, 10);

    await ensureDeliverySchema();
    const pool = await getPool();
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("governorateId", sql.Int, governorateId)
      .query(`
        DELETE FROM MenuDeliveryGovernorates
        WHERE id = @governorateId AND menuId = @menuId
      `);

    if (result.rowsAffected[0] === 0) {
      sendApiError(res, req, 404, ApiErrors.deliveryGovernorateNotFound);
      return;
    }

    res.json({ message: "Governorate deleted successfully" });
  } catch (error) {
    logger.error("Delete menu delivery governorate error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteDeliveryGovernorate);
  }
}
