import { getPool, sql } from "../config/database";
import {
  DOMAIN_TRANSFER_SYSTEM_MESSAGES,
} from "./domainTransfer.templates";

export type DomainTransferStatus =
  | "pending"
  | "awaiting_user"
  | "user_confirmed"
  | "completed"
  | "cancelled";

export type DomainTransferMessage = {
  id: number;
  requestId: number;
  senderType: "admin" | "user";
  message: string;
  adminId: number | null;
  adminName: string | null;
  createdAt: string;
};

export type DomainTransferRequest = {
  id: number;
  userId: number;
  domainUrl: string;
  status: DomainTransferStatus;
  userConfirmedAt: string | null;
  completedAt: string | null;
  completedByAdminId: number | null;
  completedByAdminName: string | null;
  cancelledAt: string | null;
  cancelledBy: "user" | "admin" | null;
  createdAt: string;
  updatedAt: string;
  messages?: DomainTransferMessage[];
};

export type AdminDomainTransferRequest = DomainTransferRequest & {
  userName: string;
  userEmail: string;
  userPhone: string | null;
};

function mapRequest(row: Record<string, unknown>): DomainTransferRequest {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    domainUrl: String(row.domainUrl),
    status: String(row.status) as DomainTransferStatus,
    userConfirmedAt: row.userConfirmedAt
      ? new Date(String(row.userConfirmedAt)).toISOString()
      : null,
    completedAt: row.completedAt
      ? new Date(String(row.completedAt)).toISOString()
      : null,
    completedByAdminId: row.completedByAdminId
      ? Number(row.completedByAdminId)
      : null,
    completedByAdminName: row.completedByAdminName
      ? String(row.completedByAdminName)
      : null,
    cancelledAt: row.cancelledAt
      ? new Date(String(row.cancelledAt)).toISOString()
      : null,
    cancelledBy: row.cancelledBy
      ? (String(row.cancelledBy) as "user" | "admin")
      : null,
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  };
}

function mapMessage(row: Record<string, unknown>): DomainTransferMessage {
  return {
    id: Number(row.id),
    requestId: Number(row.requestId),
    senderType: String(row.senderType) as "admin" | "user",
    message: String(row.message),
    adminId: row.adminId ? Number(row.adminId) : null,
    adminName: row.adminName ? String(row.adminName) : null,
    createdAt: new Date(String(row.createdAt)).toISOString(),
  };
}

export function normalizeDomainUrl(raw: string): string {
  return raw.trim();
}

export function isValidDomainUrl(raw: string): boolean {
  const value = normalizeDomainUrl(raw);
  if (!value || value.length > 500) return false;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    return Boolean(url.hostname && url.hostname.includes("."));
  } catch {
    return false;
  }
}

async function getMessagesForRequest(
  requestId: number,
): Promise<DomainTransferMessage[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("requestId", sql.Int, requestId)
    .query(`
      SELECT id, requestId, senderType, message, adminId, adminName, createdAt
      FROM DomainTransferMessages
      WHERE requestId = @requestId
      ORDER BY createdAt ASC
    `);
  return result.recordset.map(mapMessage);
}

export async function getActiveRequestForUser(
  userId: number,
): Promise<DomainTransferRequest | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT TOP 1 *
      FROM DomainTransferRequests
      WHERE userId = @userId AND status NOT IN (N'completed', N'cancelled')
      ORDER BY createdAt DESC
    `);

  if (!result.recordset.length) return null;

  const request = mapRequest(result.recordset[0]);
  request.messages = await getMessagesForRequest(request.id);
  return request;
}

export async function listUserDomainTransferHistory(
  userId: number,
): Promise<DomainTransferRequest[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT *
      FROM DomainTransferRequests
      WHERE userId = @userId AND status IN (N'completed', N'cancelled')
      ORDER BY createdAt DESC
    `);

  return result.recordset.map(mapRequest);
}

export async function createDomainTransferRequest(
  userId: number,
  domainUrl: string,
): Promise<DomainTransferRequest> {
  const normalized = normalizeDomainUrl(domainUrl);
  if (!isValidDomainUrl(normalized)) {
    throw new Error("Invalid domain URL");
  }

  const existing = await getActiveRequestForUser(userId);
  if (existing) {
    throw new Error("Active request exists");
  }

  const pool = await getPool();
  const insert = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("domainUrl", sql.NVarChar(500), normalized)
    .query(`
      INSERT INTO DomainTransferRequests (userId, domainUrl)
      OUTPUT INSERTED.*
      VALUES (@userId, @domainUrl)
    `);

  const request = mapRequest(insert.recordset[0]);
  request.messages = [];
  return request;
}

async function insertSystemMessage(
  requestId: number,
  messageKey: string,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("requestId", sql.Int, requestId)
    .input("message", sql.NVarChar(sql.MAX), messageKey)
    .query(`
      INSERT INTO DomainTransferMessages (requestId, senderType, message, adminId, adminName)
      VALUES (@requestId, N'admin', @message, NULL, N'ENS System')
    `);
}

export async function listAllDomainTransferRequests(): Promise<
  AdminDomainTransferRequest[]
> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      r.*,
      u.name AS userName,
      u.email AS userEmail,
      u.phoneNumber AS userPhone
    FROM DomainTransferRequests r
    INNER JOIN Users u ON u.id = r.userId
    ORDER BY
      CASE r.status
        WHEN N'user_confirmed' THEN 0
        WHEN N'pending' THEN 1
        WHEN N'awaiting_user' THEN 2
        WHEN N'completed' THEN 3
        WHEN N'cancelled' THEN 4
        ELSE 5
      END,
      r.createdAt DESC
  `);

  return result.recordset.map((row) => ({
    ...mapRequest(row),
    userName: String(row.userName ?? ""),
    userEmail: String(row.userEmail ?? ""),
    userPhone: row.userPhone ? String(row.userPhone) : null,
  }));
}

export async function getDomainTransferRequestById(
  requestId: number,
): Promise<AdminDomainTransferRequest | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("requestId", sql.Int, requestId)
    .query(`
      SELECT
        r.*,
        u.name AS userName,
        u.email AS userEmail,
        u.phoneNumber AS userPhone
      FROM DomainTransferRequests r
      INNER JOIN Users u ON u.id = r.userId
      WHERE r.id = @requestId
    `);

  if (!result.recordset.length) return null;

  const request: AdminDomainTransferRequest = {
    ...mapRequest(result.recordset[0]),
    userName: String(result.recordset[0].userName ?? ""),
    userEmail: String(result.recordset[0].userEmail ?? ""),
    userPhone: result.recordset[0].userPhone
      ? String(result.recordset[0].userPhone)
      : null,
  };
  request.messages = await getMessagesForRequest(requestId);
  return request;
}

async function assertRequestOwnedByUser(
  requestId: number,
  userId: number,
): Promise<DomainTransferRequest> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("requestId", sql.Int, requestId)
    .input("userId", sql.Int, userId)
    .query(`
      SELECT * FROM DomainTransferRequests
      WHERE id = @requestId AND userId = @userId
    `);

  if (!result.recordset.length) {
    throw new Error("Request not found");
  }

  return mapRequest(result.recordset[0]);
}

export async function userConfirmDomainTransferSteps(
  requestId: number,
  userId: number,
): Promise<DomainTransferRequest> {
  const request = await assertRequestOwnedByUser(requestId, userId);

  if (request.status !== "awaiting_user") {
    throw new Error("Cannot confirm");
  }

  const pool = await getPool();
  await pool
    .request()
    .input("requestId", sql.Int, requestId)
    .input("userId", sql.Int, userId)
    .query(`
      INSERT INTO DomainTransferMessages (requestId, senderType, message)
      VALUES (@requestId, N'user', N'confirmed_steps');

      UPDATE DomainTransferRequests
      SET status = N'user_confirmed',
          userConfirmedAt = SYSUTCDATETIME(),
          updatedAt = SYSUTCDATETIME()
      WHERE id = @requestId AND userId = @userId
    `);

  await insertSystemMessage(
    requestId,
    DOMAIN_TRANSFER_SYSTEM_MESSAGES.VERIFICATION_STARTED,
  );

  const updated = await getDomainTransferRequestById(requestId);
  if (!updated) throw new Error("Request not found");
  return updated;
}

export async function adminSendDomainTransferMessage(
  requestId: number,
  message: string,
  adminId: number | null,
  adminName: string,
): Promise<AdminDomainTransferRequest> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Message required");

  const existing = await getDomainTransferRequestById(requestId);
  if (!existing) throw new Error("Request not found");
  if (existing.status === "completed" || existing.status === "cancelled") {
    throw new Error("Request closed");
  }

  const pool = await getPool();
  await pool
    .request()
    .input("requestId", sql.Int, requestId)
    .input("message", sql.NVarChar(sql.MAX), trimmed)
    .input("adminId", sql.Int, adminId)
    .input("adminName", sql.NVarChar(255), adminName)
    .query(`
      INSERT INTO DomainTransferMessages (requestId, senderType, message, adminId, adminName)
      VALUES (@requestId, N'admin', @message, @adminId, @adminName);

      UPDATE DomainTransferRequests
      SET status = N'awaiting_user',
          userConfirmedAt = NULL,
          updatedAt = SYSUTCDATETIME()
      WHERE id = @requestId
    `);

  const updated = await getDomainTransferRequestById(requestId);
  if (!updated) throw new Error("Request not found");
  return updated;
}

export async function adminCompleteDomainTransfer(
  requestId: number,
  adminId: number | null,
  adminName: string,
): Promise<AdminDomainTransferRequest> {
  const existing = await getDomainTransferRequestById(requestId);
  if (!existing) throw new Error("Request not found");
  if (existing.status === "completed" || existing.status === "cancelled") {
    throw new Error("Request closed");
  }

  const pool = await getPool();
  await pool
    .request()
    .input("requestId", sql.Int, requestId)
    .input("adminId", sql.Int, adminId)
    .query(`
      UPDATE DomainTransferRequests
      SET status = N'completed',
          completedAt = SYSUTCDATETIME(),
          completedByAdminId = @adminId,
          completedByAdminName = N'ENS System',
          updatedAt = SYSUTCDATETIME()
      WHERE id = @requestId
    `);

  await insertSystemMessage(
    requestId,
    DOMAIN_TRANSFER_SYSTEM_MESSAGES.TRANSFER_COMPLETE,
  );

  const updated = await getDomainTransferRequestById(requestId);
  if (!updated) throw new Error("Request not found");
  return updated;
}

function assertCancellable(status: DomainTransferStatus): void {
  if (status === "completed" || status === "cancelled") {
    throw new Error("Request closed");
  }
}

export async function userCancelDomainTransfer(
  requestId: number,
  userId: number,
): Promise<void> {
  const request = await assertRequestOwnedByUser(requestId, userId);
  assertCancellable(request.status);

  const pool = await getPool();
  await pool
    .request()
    .input("requestId", sql.Int, requestId)
    .input("userId", sql.Int, userId)
    .query(`
      UPDATE DomainTransferRequests
      SET status = N'cancelled',
          cancelledAt = SYSUTCDATETIME(),
          cancelledBy = N'user',
          updatedAt = SYSUTCDATETIME()
      WHERE id = @requestId AND userId = @userId
    `);
}

export async function adminCancelDomainTransfer(
  requestId: number,
): Promise<AdminDomainTransferRequest> {
  const existing = await getDomainTransferRequestById(requestId);
  if (!existing) throw new Error("Request not found");
  assertCancellable(existing.status);

  const pool = await getPool();
  await pool
    .request()
    .input("requestId", sql.Int, requestId)
    .query(`
      UPDATE DomainTransferRequests
      SET status = N'cancelled',
          cancelledAt = SYSUTCDATETIME(),
          cancelledBy = N'admin',
          updatedAt = SYSUTCDATETIME()
      WHERE id = @requestId
    `);

  const updated = await getDomainTransferRequestById(requestId);
  if (!updated) throw new Error("Request not found");
  return updated;
}
