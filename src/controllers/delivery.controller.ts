import { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { ensureDeliverySchema } from "../schemas/delivery.schema";

const USER_DELIVERY_FIELDS = `
  id, email, name, restaurantName, phoneNumber, deliveryPhone, deliveryOn,
  country, dateOfBirth, gender, address,
  role, isEmailVerified, isPhoneVerified, phoneVerifiedAt, createdAt, profileImage,
  CAST(
    CASE
      WHEN NULLIF(LTRIM(RTRIM(ISNULL(fcmToken, N''))), N'') IS NOT NULL
      THEN 1
      ELSE 0
    END
  AS BIT) AS hasFcmToken
`;

function formatUserRow(row: Record<string, unknown>) {
  const typed = row as Record<string, unknown> & {
    hasFcmToken?: unknown;
    isPhoneVerified?: boolean | number | null;
    phoneVerifiedAt?: Date | null;
    deliveryOn?: boolean | number | null;
  };

  return {
    ...typed,
    hasFcmToken: Boolean(typed.hasFcmToken),
    isPhoneVerified: Boolean(typed.isPhoneVerified),
    phoneVerifiedAt: typed.phoneVerifiedAt ?? null,
    deliveryOn: Boolean(typed.deliveryOn),
  };
}

async function getUserDeliveryContact(
  userId: number,
): Promise<{ deliveryPhone: string | null; phoneNumber: string | null }> {
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.Int, userId).query(`
      SELECT deliveryPhone, phoneNumber
      FROM Users
      WHERE id = @userId
    `);

  if (result.recordset.length === 0) {
    throw new Error("User not found");
  }

  const row = result.recordset[0] as {
    deliveryPhone: string | null;
    phoneNumber: string | null;
  };

  return {
    deliveryPhone: row.deliveryPhone?.trim() || null,
    phoneNumber: row.phoneNumber?.trim() || null,
  };
}

export async function getDeliverySettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    await ensureDeliverySchema();

    const pool = await getPool();
    const userResult = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT deliveryOn, deliveryPhone, phoneNumber
        FROM Users
        WHERE id = @userId
      `);

    if (userResult.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }

    const governoratesResult = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT id, nameAr, nameEn, price, createdAt, updatedAt
        FROM UserDeliveryGovernorates
        WHERE userId = @userId
        ORDER BY id
      `);

    const user = userResult.recordset[0] as {
      deliveryOn: boolean | number;
      deliveryPhone: string | null;
      phoneNumber: string | null;
    };

    res.json({
      deliveryOn: Boolean(user.deliveryOn),
      deliveryPhone: user.deliveryPhone ?? null,
      phoneNumber: user.phoneNumber ?? null,
      governorates: governoratesResult.recordset,
    });
  } catch (error) {
    logger.error("Get delivery settings error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetDeliverySettings);
  }
}

export async function updateDeliverySettings(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { deliveryOn, deliveryPhone } = req.body;

    await ensureDeliverySchema();

    if (deliveryOn === undefined && deliveryPhone === undefined) {
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
      return;
    }

    const pool = await getPool();
    const updates: string[] = [];
    const request = pool.request().input("userId", sql.Int, userId);

    if (deliveryOn !== undefined) {
      const enabled = Boolean(deliveryOn);
      updates.push("deliveryOn = @deliveryOn");
      request.input("deliveryOn", sql.Bit, enabled);

      if (enabled) {
        const incomingPhone =
          typeof deliveryPhone === "string" ? deliveryPhone.trim() : "";
        const current = await getUserDeliveryContact(userId);
        const resolvedPhone =
          incomingPhone ||
          current.deliveryPhone ||
          current.phoneNumber ||
          "";

        if (!resolvedPhone) {
          sendApiError(res, req, 400, ApiErrors.deliveryPhoneRequired);
          return;
        }

        if (incomingPhone || !current.deliveryPhone) {
          updates.push("deliveryPhone = @deliveryPhone");
          request.input("deliveryPhone", sql.NVarChar, resolvedPhone);
        }
      }
    } else if (deliveryPhone !== undefined) {
      const trimmed =
        typeof deliveryPhone === "string" ? deliveryPhone.trim() : "";
      if (!trimmed) {
        sendApiError(res, req, 400, ApiErrors.deliveryPhoneRequired);
        return;
      }
      updates.push("deliveryPhone = @deliveryPhone");
      request.input("deliveryPhone", sql.NVarChar, trimmed);
    }

    await request.query(`
      UPDATE Users
      SET ${updates.join(", ")}
      WHERE id = @userId
    `);

    const userResult = await pool.request().input("userId", sql.Int, userId)
      .query(`SELECT ${USER_DELIVERY_FIELDS} FROM Users WHERE id = @userId`);

    res.json({
      message: "Delivery settings updated successfully",
      user: formatUserRow(userResult.recordset[0] as Record<string, unknown>),
    });
  } catch (error) {
    logger.error("Update delivery settings error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateDeliverySettings);
  }
}

export async function getDeliveryGovernorates(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    await ensureDeliverySchema();

    const pool = await getPool();
    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT id, nameAr, nameEn, price, createdAt, updatedAt
        FROM UserDeliveryGovernorates
        WHERE userId = @userId
        ORDER BY id
      `);

    res.json({ governorates: result.recordset });
  } catch (error) {
    logger.error("Get delivery governorates error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetDeliveryGovernorates);
  }
}

export async function createDeliveryGovernorate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { nameAr, nameEn, price } = req.body;

    await ensureDeliverySchema();

    const pool = await getPool();
    const result = await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("nameAr", sql.NVarChar, nameAr)
      .input("nameEn", sql.NVarChar, nameEn)
      .input("price", sql.Decimal(10, 2), price).query(`
        INSERT INTO UserDeliveryGovernorates (userId, nameAr, nameEn, price)
        OUTPUT INSERTED.id, INSERTED.nameAr, INSERTED.nameEn, INSERTED.price,
               INSERTED.createdAt, INSERTED.updatedAt
        VALUES (@userId, @nameAr, @nameEn, @price)
      `);

    res.status(201).json({ governorate: result.recordset[0] });
  } catch (error) {
    logger.error("Create delivery governorate error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateDeliveryGovernorate);
  }
}

export async function updateDeliveryGovernorate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const governorateId = parseInt(req.params.governorateId, 10);
    const { nameAr, nameEn, price } = req.body;

    await ensureDeliverySchema();

    const pool = await getPool();
    const updates: string[] = ["updatedAt = GETDATE()"];
    const request = pool
      .request()
      .input("userId", sql.Int, userId)
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

    if (updates.length === 1) {
      sendApiError(res, req, 400, ApiErrors.noFieldsToUpdate);
      return;
    }

    const result = await request.query(`
      UPDATE UserDeliveryGovernorates
      SET ${updates.join(", ")}
      OUTPUT INSERTED.id, INSERTED.nameAr, INSERTED.nameEn, INSERTED.price,
             INSERTED.createdAt, INSERTED.updatedAt
      WHERE id = @governorateId AND userId = @userId
    `);

    if (result.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.deliveryGovernorateNotFound);
      return;
    }

    res.json({ governorate: result.recordset[0] });
  } catch (error) {
    logger.error("Update delivery governorate error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateDeliveryGovernorate);
  }
}

export async function deleteDeliveryGovernorate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const governorateId = parseInt(req.params.governorateId, 10);

    await ensureDeliverySchema();

    const pool = await getPool();
    const result = await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("governorateId", sql.Int, governorateId).query(`
        DELETE FROM UserDeliveryGovernorates
        WHERE id = @governorateId AND userId = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      sendApiError(res, req, 404, ApiErrors.deliveryGovernorateNotFound);
      return;
    }

    res.json({ message: "Governorate deleted successfully" });
  } catch (error) {
    logger.error("Delete delivery governorate error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteDeliveryGovernorate);
  }
}
