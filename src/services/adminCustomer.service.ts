import crypto from "crypto";
import { getPool, sql } from "../config/database";
import { ensureAdminCustomerSchema } from "./adminCustomerSchema.service";
import { sendPasswordResetEmail } from "./emailService";
import { TOKEN_EXPIRY } from "../config/constants";

export type AccountStatus = "active" | "blocked" | "deleted" | "suspended";

export function resolveAccountStatus(user: {
  deletedAt?: Date | string | null;
  isBlocked?: boolean | number | null;
  isSuspended?: boolean | number | null;
}): AccountStatus {
  if (user.deletedAt) return "deleted";
  if (user.isBlocked) return "blocked";
  if (user.isSuspended) return "suspended";
  return "active";
}

async function ensureSchema(): Promise<void> {
  await ensureAdminCustomerSchema();
}

async function assertUserExists(
  userId: number,
): Promise<Record<string, unknown>> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT id, name, email, role, deletedAt
      FROM Users
      WHERE id = @userId AND role = 'user'
    `);
  if (result.recordset.length === 0) {
    throw new Error("USER_NOT_FOUND");
  }
  return result.recordset[0];
}

export async function logUserAdminActivity(
  userId: number,
  adminId: number | null,
  adminName: string,
  action: string,
  details?: string | null,
): Promise<void> {
  await ensureSchema();
  const pool = await getPool();
  await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("adminId", sql.Int, adminId)
    .input("adminName", sql.NVarChar(255), adminName.slice(0, 255))
    .input("action", sql.NVarChar(100), action.slice(0, 100))
    .input("details", sql.NVarChar(sql.MAX), details ?? null)
    .query(`
      INSERT INTO UserAdminActivityLog (userId, adminId, adminName, action, details)
      VALUES (@userId, @adminId, @adminName, @action, @details)
    `);
}

export async function updateUserProfile(
  userId: number,
  data: {
    name?: string;
    email?: string;
    phoneNumber?: string | null;
    country?: string | null;
    address?: string | null;
    restaurantName?: string | null;
  },
  adminId: number | null,
  adminName: string,
): Promise<void> {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  const fields: string[] = [];
  const request = pool.request().input("userId", sql.Int, userId);

  if (data.name !== undefined) {
    request.input("name", sql.NVarChar(255), data.name.trim().slice(0, 255));
    fields.push("name = @name");
  }
  if (data.email !== undefined) {
    request.input("email", sql.NVarChar(255), data.email.trim().toLowerCase());
    fields.push("email = @email");
  }
  if (data.phoneNumber !== undefined) {
    request.input(
      "phoneNumber",
      sql.NVarChar(50),
      data.phoneNumber?.trim() || null,
    );
    fields.push("phoneNumber = @phoneNumber");
  }
  if (data.country !== undefined) {
    request.input("country", sql.NVarChar(100), data.country?.trim() || null);
    fields.push("country = @country");
  }
  if (data.address !== undefined) {
    request.input("address", sql.NVarChar(500), data.address?.trim() || null);
    fields.push("address = @address");
  }
  if (data.restaurantName !== undefined) {
    request.input(
      "restaurantName",
      sql.NVarChar(255),
      data.restaurantName?.trim() || null,
    );
    fields.push("restaurantName = @restaurantName");
  }

  if (fields.length === 0) return;

  fields.push("updatedAt = SYSUTCDATETIME()");
  await request.query(`UPDATE Users SET ${fields.join(", ")} WHERE id = @userId`);

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "profile_updated",
    JSON.stringify(data),
  );
}

export async function toggleUserBlock(
  userId: number,
  isBlocked: boolean,
  reason: string | null,
  adminId: number | null,
  adminName: string,
): Promise<void> {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("isBlocked", sql.Bit, isBlocked ? 1 : 0)
    .input("blockedAt", sql.DateTime2, isBlocked ? new Date() : null)
    .input("blockedReason", sql.NVarChar(500), isBlocked ? reason : null)
    .query(`
      UPDATE Users
      SET isBlocked = @isBlocked,
          blockedAt = @blockedAt,
          blockedReason = @blockedReason,
          updatedAt = SYSUTCDATETIME()
      WHERE id = @userId
    `);

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    isBlocked ? "account_blocked" : "account_unblocked",
    reason,
  );
}

export async function softDeleteUser(
  userId: number,
  adminId: number | null,
  adminName: string,
): Promise<void> {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  await pool.request().input("userId", sql.Int, userId).query(`
    UPDATE Users
    SET deletedAt = SYSUTCDATETIME(),
        isSuspended = 1,
        updatedAt = SYSUTCDATETIME()
    WHERE id = @userId
  `);

  await logUserAdminActivity(userId, adminId, adminName, "account_soft_deleted");
}

export async function restoreSoftDeletedUser(
  userId: number,
  adminId: number | null,
  adminName: string,
): Promise<void> {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT id FROM Users WHERE id = @userId AND role = 'user' AND deletedAt IS NOT NULL
    `);
  if (result.recordset.length === 0) {
    throw new Error("USER_NOT_FOUND_OR_NOT_DELETED");
  }

  await pool.request().input("userId", sql.Int, userId).query(`
    UPDATE Users
    SET deletedAt = NULL,
        isSuspended = 0,
        updatedAt = SYSUTCDATETIME()
    WHERE id = @userId
  `);

  await logUserAdminActivity(userId, adminId, adminName, "account_restored");
}

export async function sendUserPasswordResetLink(
  userId: number,
  locale: "ar" | "en",
  adminId: number | null,
  adminName: string,
): Promise<void> {
  await ensureSchema();
  const pool = await getPool();
  const userResult = await pool
    .request()
    .input("userId", sql.Int, userId)
    .query(`SELECT id, email, name FROM Users WHERE id = @userId AND role = 'user'`);

  if (userResult.recordset.length === 0) {
    throw new Error("USER_NOT_FOUND");
  }
  const user = userResult.recordset[0];

  await pool
    .request()
    .input("userId", sql.Int, userId)
    .query("DELETE FROM PasswordResets WHERE userId = @userId");

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.PASSWORD_RESET);

  await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("token", sql.NVarChar, token)
    .input("expiresAt", sql.DateTime2, expiresAt)
    .query(`
      INSERT INTO PasswordResets (userId, token, expiresAt)
      VALUES (@userId, @token, @expiresAt)
    `);

  const sent = await sendPasswordResetEmail(
    user.email,
    user.name,
    token,
    locale,
  );
  if (!sent) {
    throw new Error("EMAIL_SEND_FAILED");
  }

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "password_reset_sent",
    user.email,
  );
}

function mapAddressRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    label: row.label ?? null,
    addressLine: String(row.addressLine ?? ""),
    city: row.city ?? null,
    governorate: row.governorate ?? null,
    country: row.country ?? null,
    postalCode: row.postalCode ?? null,
    isDefault: Boolean(row.isDefault),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listUserAddresses(userId: number) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT * FROM UserAddresses WHERE userId = @userId ORDER BY isDefault DESC, createdAt DESC
  `);
  return result.recordset.map(mapAddressRow);
}

export async function createUserAddress(
  userId: number,
  data: {
    label?: string | null;
    addressLine: string;
    city?: string | null;
    governorate?: string | null;
    country?: string | null;
    postalCode?: string | null;
    isDefault?: boolean;
  },
  adminId: number | null,
  adminName: string,
) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  if (data.isDefault) {
    await pool.request().input("userId", sql.Int, userId).query(`
      UPDATE UserAddresses SET isDefault = 0 WHERE userId = @userId
    `);
  }

  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("label", sql.NVarChar(100), data.label?.trim() || null)
    .input("addressLine", sql.NVarChar(500), data.addressLine.trim())
    .input("city", sql.NVarChar(100), data.city?.trim() || null)
    .input("governorate", sql.NVarChar(100), data.governorate?.trim() || null)
    .input("country", sql.NVarChar(100), data.country?.trim() || null)
    .input("postalCode", sql.NVarChar(20), data.postalCode?.trim() || null)
    .input("isDefault", sql.Bit, data.isDefault ? 1 : 0)
    .query(`
      INSERT INTO UserAddresses (userId, label, addressLine, city, governorate, country, postalCode, isDefault)
      OUTPUT INSERTED.*
      VALUES (@userId, @label, @addressLine, @city, @governorate, @country, @postalCode, @isDefault)
    `);

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "address_created",
    data.addressLine,
  );
  return mapAddressRow(result.recordset[0]);
}

export async function updateUserAddress(
  userId: number,
  addressId: number,
  data: {
    label?: string | null;
    addressLine?: string;
    city?: string | null;
    governorate?: string | null;
    country?: string | null;
    postalCode?: string | null;
    isDefault?: boolean;
  },
  adminId: number | null,
  adminName: string,
) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  const existing = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("addressId", sql.Int, addressId)
    .query(`
      SELECT id FROM UserAddresses WHERE id = @addressId AND userId = @userId
    `);
  if (existing.recordset.length === 0) {
    throw new Error("ADDRESS_NOT_FOUND");
  }

  if (data.isDefault) {
    await pool.request().input("userId", sql.Int, userId).query(`
      UPDATE UserAddresses SET isDefault = 0 WHERE userId = @userId
    `);
  }

  const fields: string[] = ["updatedAt = SYSUTCDATETIME()"];
  const request = pool
    .request()
    .input("userId", sql.Int, userId)
    .input("addressId", sql.Int, addressId);

  if (data.label !== undefined) {
    request.input("label", sql.NVarChar(100), data.label?.trim() || null);
    fields.push("label = @label");
  }
  if (data.addressLine !== undefined) {
    request.input("addressLine", sql.NVarChar(500), data.addressLine.trim());
    fields.push("addressLine = @addressLine");
  }
  if (data.city !== undefined) {
    request.input("city", sql.NVarChar(100), data.city?.trim() || null);
    fields.push("city = @city");
  }
  if (data.governorate !== undefined) {
    request.input(
      "governorate",
      sql.NVarChar(100),
      data.governorate?.trim() || null,
    );
    fields.push("governorate = @governorate");
  }
  if (data.country !== undefined) {
    request.input("country", sql.NVarChar(100), data.country?.trim() || null);
    fields.push("country = @country");
  }
  if (data.postalCode !== undefined) {
    request.input(
      "postalCode",
      sql.NVarChar(20),
      data.postalCode?.trim() || null,
    );
    fields.push("postalCode = @postalCode");
  }
  if (data.isDefault !== undefined) {
    request.input("isDefault", sql.Bit, data.isDefault ? 1 : 0);
    fields.push("isDefault = @isDefault");
  }

  await request.query(`
    UPDATE UserAddresses SET ${fields.join(", ")}
    WHERE id = @addressId AND userId = @userId
  `);

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "address_updated",
    String(addressId),
  );

  const updated = await pool
    .request()
    .input("addressId", sql.Int, addressId)
    .query(`SELECT * FROM UserAddresses WHERE id = @addressId`);
  return mapAddressRow(updated.recordset[0]);
}

export async function deleteUserAddress(
  userId: number,
  addressId: number,
  adminId: number | null,
  adminName: string,
): Promise<void> {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("addressId", sql.Int, addressId)
    .query(`
      DELETE FROM UserAddresses WHERE id = @addressId AND userId = @userId
    `);
  if (result.rowsAffected[0] === 0) {
    throw new Error("ADDRESS_NOT_FOUND");
  }
  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "address_deleted",
    String(addressId),
  );
}

export async function listUserInternalNotes(userId: number) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT id, userId, adminId, adminName, note, createdAt
    FROM UserInternalNotes
    WHERE userId = @userId
    ORDER BY createdAt DESC
  `);
  return result.recordset.map((row) => ({
    id: Number(row.id),
    userId: Number(row.userId),
    adminId: row.adminId ?? null,
    adminName: String(row.adminName),
    note: String(row.note),
    createdAt: row.createdAt,
  }));
}

export async function addUserInternalNote(
  userId: number,
  note: string,
  adminId: number | null,
  adminName: string,
) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();
  const trimmed = note.trim();
  if (!trimmed) {
    throw new Error("NOTE_REQUIRED");
  }

  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("adminId", sql.Int, adminId)
    .input("adminName", sql.NVarChar(255), adminName.slice(0, 255))
    .input("note", sql.NVarChar(sql.MAX), trimmed)
    .query(`
      INSERT INTO UserInternalNotes (userId, adminId, adminName, note)
      OUTPUT INSERTED.*
      VALUES (@userId, @adminId, @adminName, @note)
    `);

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "note_added",
    trimmed.slice(0, 200),
  );

  const row = result.recordset[0];
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    adminId: row.adminId ?? null,
    adminName: String(row.adminName),
    note: String(row.note),
    createdAt: row.createdAt,
  };
}

export async function deleteUserInternalNote(
  userId: number,
  noteId: number,
  adminId: number | null,
  adminName: string,
): Promise<void> {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("noteId", sql.Int, noteId)
    .query(`
      DELETE FROM UserInternalNotes WHERE id = @noteId AND userId = @userId
    `);
  if (result.rowsAffected[0] === 0) {
    throw new Error("NOTE_NOT_FOUND");
  }
  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "note_deleted",
    String(noteId),
  );
}

export async function getUserActivityLog(userId: number, limit = 50) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  const adminLog = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit) id, adminName, action, details, createdAt
      FROM UserAdminActivityLog
      WHERE userId = @userId
      ORDER BY createdAt DESC
    `);

  const userMeta = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT lastLoginAt, updatedAt, deletedAt FROM Users WHERE id = @userId
  `);

  const lastOrder = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT TOP 1 s.id, s.status, s.amount, s.paidAt, s.createdAt, p.name AS planName
    FROM Subscriptions s
    INNER JOIN Plans p ON s.planId = p.id
    WHERE s.userId = @userId
    ORDER BY s.createdAt DESC
  `);

  const meta = userMeta.recordset[0] ?? {};

  return {
    lastLoginAt: meta.lastLoginAt ?? null,
    lastAccountUpdate: meta.updatedAt ?? null,
    lastOrder: lastOrder.recordset[0] ?? null,
    entries: adminLog.recordset.map((row) => ({
      id: Number(row.id),
      adminName: String(row.adminName),
      action: String(row.action),
      details: row.details ?? null,
      createdAt: row.createdAt,
    })),
  };
}

export async function getUserOrdersSummary(userId: number) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  const ordersResult = await pool.request().input("userId", sql.Int, userId)
    .query(`
      SELECT
        s.id, s.billingCycle, s.startDate, s.endDate, s.status,
        s.amount, s.paymentStatus, s.paidAt, s.createdAt,
        p.name AS planName
      FROM Subscriptions s
      INNER JOIN Plans p ON s.planId = p.id
      WHERE s.userId = @userId
      ORDER BY s.createdAt DESC
    `);

  const orders = ordersResult.recordset.map((row) => ({
    id: Number(row.id),
    planName: String(row.planName),
    billingCycle: row.billingCycle,
    status: row.status,
    paymentStatus: row.paymentStatus,
    amount: Number(row.amount ?? 0),
    paidAt: row.paidAt ?? null,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    createdAt: row.createdAt,
  }));

  const paidOrders = orders.filter(
    (o) =>
      String(o.paymentStatus ?? "").toLowerCase() === "paid" ||
      String(o.paymentStatus ?? "").toLowerCase() === "completed" ||
      o.paidAt,
  );
  const totalPaid = paidOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

  return {
    orders,
    stats: {
      totalOrders: orders.length,
      totalPaid,
      lastOrder: orders[0] ?? null,
    },
  };
}

export async function getUserVouchersInfo(userId: number) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  const redemptions = await pool.request().input("userId", sql.Int, userId)
    .query(`
      SELECT vr.id, vr.redeemed_at, v.id AS voucherId, v.code, v.type,
             v.discount_type, v.discount_value, v.description
      FROM VoucherRedemptions vr
      INNER JOIN Vouchers v ON vr.voucher_id = v.id
      WHERE vr.user_id = @userId
      ORDER BY vr.redeemed_at DESC
    `);

  const blocked = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT ubv.id, ubv.voucherId, ubv.blockedAt, v.code, v.description
    FROM UserBlockedVouchers ubv
    INNER JOIN Vouchers v ON ubv.voucherId = v.id
    WHERE ubv.userId = @userId
    ORDER BY ubv.blockedAt DESC
  `);

  return {
    redemptions: redemptions.recordset.map((row) => ({
      id: Number(row.id),
      voucherId: Number(row.voucherId),
      code: String(row.code),
      type: row.type,
      discountType: row.discount_type ?? null,
      discountValue: row.discount_value ?? null,
      description: row.description ?? null,
      redeemedAt: row.redeemed_at,
    })),
    blocked: blocked.recordset.map((row) => ({
      id: Number(row.id),
      voucherId: Number(row.voucherId),
      code: String(row.code),
      description: row.description ?? null,
      blockedAt: row.blockedAt,
    })),
  };
}

export async function blockVoucherForUser(
  userId: number,
  voucherId: number,
  adminId: number | null,
  adminName: string,
): Promise<void> {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("voucherId", sql.Int, voucherId)
    .input("blockedByAdminId", sql.Int, adminId)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM UserBlockedVouchers WHERE userId = @userId AND voucherId = @voucherId)
        INSERT INTO UserBlockedVouchers (userId, voucherId, blockedByAdminId)
        VALUES (@userId, @voucherId, @blockedByAdminId)
    `);

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "voucher_blocked",
    String(voucherId),
  );
}

export async function unblockVoucherForUser(
  userId: number,
  voucherId: number,
  adminId: number | null,
  adminName: string,
): Promise<void> {
  await ensureSchema();
  const pool = await getPool();
  await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("voucherId", sql.Int, voucherId)
    .query(`
      DELETE FROM UserBlockedVouchers WHERE userId = @userId AND voucherId = @voucherId
    `);

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "voucher_unblocked",
    String(voucherId),
  );
}

export async function assignCustomVoucherToUser(
  userId: number,
  code: string,
  adminId: number | null,
  adminName: string,
) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();
  const normalized = code.trim().toUpperCase();

  const voucherResult = await pool
    .request()
    .input("code", sql.NVarChar(50), normalized)
    .query(`SELECT id, code FROM Vouchers WHERE code = @code AND is_active = 1`);

  if (voucherResult.recordset.length === 0) {
    throw new Error("VOUCHER_NOT_FOUND");
  }
  const voucher = voucherResult.recordset[0];

  const existing = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("voucherId", sql.Int, voucher.id)
    .query(`
      SELECT id FROM VoucherRedemptions WHERE user_id = @userId AND voucher_id = @voucherId
    `);

  if (existing.recordset.length > 0) {
    throw new Error("VOUCHER_ALREADY_USED");
  }

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "voucher_assigned",
    normalized,
  );

  return {
    voucherId: Number(voucher.id),
    code: String(voucher.code),
    message: "Voucher assigned — user can redeem at checkout",
  };
}

export async function listUserSupportCases(userId: number) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT id, userId, subject, message, status, ticketRef, adminName, createdAt, updatedAt
    FROM UserSupportCases
    WHERE userId = @userId
    ORDER BY createdAt DESC
  `);
  return result.recordset.map((row) => ({
    id: Number(row.id),
    userId: Number(row.userId),
    subject: String(row.subject),
    message: String(row.message),
    status: String(row.status),
    ticketRef: row.ticketRef ?? null,
    adminName: row.adminName ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function createUserSupportCase(
  userId: number,
  data: {
    subject: string;
    message: string;
    ticketRef?: string | null;
  },
  adminId: number | null,
  adminName: string,
) {
  await ensureSchema();
  await assertUserExists(userId);
  const pool = await getPool();

  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("subject", sql.NVarChar(255), data.subject.trim())
    .input("message", sql.NVarChar(sql.MAX), data.message.trim())
    .input("ticketRef", sql.NVarChar(100), data.ticketRef?.trim() || null)
    .input("adminId", sql.Int, adminId)
    .input("adminName", sql.NVarChar(255), adminName.slice(0, 255))
    .query(`
      INSERT INTO UserSupportCases (userId, subject, message, ticketRef, adminId, adminName)
      OUTPUT INSERTED.*
      VALUES (@userId, @subject, @message, @ticketRef, @adminId, @adminName)
    `);

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "support_case_created",
    data.subject,
  );

  const row = result.recordset[0];
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    subject: String(row.subject),
    message: String(row.message),
    status: String(row.status),
    ticketRef: row.ticketRef ?? null,
    adminName: row.adminName ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function updateUserSupportCaseStatus(
  userId: number,
  caseId: number,
  status: string,
  adminId: number | null,
  adminName: string,
) {
  await ensureSchema();
  const valid = ["open", "in_progress", "resolved", "closed"];
  if (!valid.includes(status)) {
    throw new Error("INVALID_STATUS");
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("caseId", sql.Int, caseId)
    .input("status", sql.NVarChar(50), status)
    .query(`
      UPDATE UserSupportCases
      SET status = @status, updatedAt = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE id = @caseId AND userId = @userId
    `);

  if (result.recordset.length === 0) {
    throw new Error("CASE_NOT_FOUND");
  }

  await logUserAdminActivity(
    userId,
    adminId,
    adminName,
    "support_status_updated",
    `${caseId}:${status}`,
  );

  const row = result.recordset[0];
  return {
    id: Number(row.id),
    status: String(row.status),
    updatedAt: row.updatedAt,
  };
}

export async function getAdminDisplayName(adminId: number): Promise<string> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("adminId", sql.Int, adminId)
    .query(`SELECT name FROM Users WHERE id = @adminId`);
  return result.recordset[0]?.name ?? "Admin";
}
