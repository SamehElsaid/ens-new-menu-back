import crypto from "crypto";
import { getPool, sql } from "../config/database";

export type FollowUpSegment =
  | "all"
  | "new"
  | "no-menu"
  | "expiring"
  | "inactive"
  | "overdue"
  | "free"
  | "pro";

export type FollowUpOutcome =
  | "answered"
  | "no_answer"
  | "busy"
  | "wrong_number"
  | "callback_requested";

export type FollowUpPurpose =
  | "onboarding"
  | "free_plan"
  | "upgrade_pro"
  | "renewal"
  | "support"
  | "other";

const VALID_OUTCOMES = new Set<string>([
  "answered",
  "no_answer",
  "busy",
  "wrong_number",
  "callback_requested",
]);

const VALID_PURPOSES = new Set<string>([
  "onboarding",
  "free_plan",
  "upgrade_pro",
  "renewal",
  "support",
  "other",
]);

type FollowUpCallContactFields = {
  customerName?: string;
  governorate?: string;
  cafeName?: string;
  otherContactNumbers?: string;
};

function optionalText(value: unknown, maxLen: number): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function mapFollowUpCallRow(row: {
  id: string;
  userId: number;
  userName?: string | null;
  phoneNumber?: string | null;
  adminName?: string | null;
  outcome: string;
  purpose?: string | null;
  notes?: string | null;
  calledAt: Date | string;
  nextFollowUpAt?: Date | string | null;
  customerName?: string | null;
  governorate?: string | null;
  cafeName?: string | null;
  otherContactNumbers?: string | null;
}) {
  return {
    id: String(row.id),
    userId: Number(row.userId),
    userName: row.userName ?? undefined,
    phoneNumber: row.phoneNumber ?? null,
    adminName: row.adminName ?? undefined,
    outcome: row.outcome,
    purpose: row.purpose ?? undefined,
    notes: row.notes ?? undefined,
    calledAt: new Date(row.calledAt).toISOString(),
    nextFollowUpAt: row.nextFollowUpAt
      ? String(row.nextFollowUpAt).slice(0, 10)
      : null,
    customerName: row.customerName ?? undefined,
    governorate: row.governorate ?? undefined,
    cafeName: row.cafeName ?? undefined,
    otherContactNumbers: row.otherContactNumbers ?? undefined,
  };
}

function normalizeContactFields(
  payload: FollowUpCallContactFields,
): FollowUpCallContactFields {
  return {
    customerName: optionalText(payload.customerName, 255),
    governorate: optionalText(payload.governorate, 255),
    cafeName: optionalText(payload.cafeName, 255),
    otherContactNumbers: optionalText(payload.otherContactNumbers, 4000),
  };
}

function computeSegments(row: {
  planName: string | null;
  menusCount: number;
  createdAt: Date;
  lastLoginAt: Date | null;
  endDate: Date | null;
  nextFollowUpAt: Date | null;
}): FollowUpSegment[] {
  const segments: FollowUpSegment[] = [];
  const plan = String(row.planName ?? "").toLowerCase();
  const isFree =
    !plan || plan.includes("free") || plan === "مجاني" || plan === "trial";
  const isPro = !isFree && plan.length > 0;

  if (isFree) segments.push("free");
  if (isPro) segments.push("pro");

  const created = new Date(row.createdAt);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (created >= weekAgo) segments.push("new");

  if (Number(row.menusCount) === 0) segments.push("no-menu");

  if (row.endDate) {
    const end = new Date(row.endDate);
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    if (end > new Date() && end <= in7) segments.push("expiring");
  }

  const inactiveSince = new Date();
  inactiveSince.setDate(inactiveSince.getDate() - 30);
  if (!row.lastLoginAt || new Date(row.lastLoginAt) < inactiveSince) {
    segments.push("inactive");
  }

  if (row.nextFollowUpAt) {
    const next = new Date(row.nextFollowUpAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (next < today) segments.push("overdue");
  }

  return segments;
}

export async function buildFollowUpQueue(segment: FollowUpSegment) {
  const pool = await getPool();

  const usersResult = await pool.request().query(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.phoneNumber,
      ISNULL(p.name, 'Free') AS planName,
      (SELECT COUNT(*) FROM Menus WHERE userId = u.id) AS menusCount,
      u.lastLoginAt,
      s.endDate,
      u.createdAt,
      (
        SELECT TOP 1 c.nextFollowUpAt
        FROM AdminFollowUpCalls c
        WHERE c.userId = u.id
        ORDER BY c.calledAt DESC
      ) AS nextFollowUpAt,
      (
        SELECT TOP 1
          c.id, c.userId, c.adminName, c.outcome, c.purpose, c.notes,
          c.calledAt, c.nextFollowUpAt,
          c.customerName, c.governorate, c.cafeName, c.otherContactNumbers
        FROM AdminFollowUpCalls c
        WHERE c.userId = u.id
        ORDER BY c.calledAt DESC
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
      ) AS lastCallJson
    FROM Users u
    LEFT JOIN Subscriptions s ON u.id = s.userId
      AND s.status = 'active' AND (s.endDate IS NULL OR s.endDate > GETDATE())
    LEFT JOIN Plans p ON s.planId = p.id
    WHERE u.role = 'user'
    ORDER BY u.createdAt DESC
  `);

  const users = usersResult.recordset
    .map((row) => {
      let lastCall = null;
      if (row.lastCallJson) {
        try {
          const parsed = JSON.parse(String(row.lastCallJson));
          lastCall = {
            id: String(parsed.id),
            userId: Number(parsed.userId),
            adminName: parsed.adminName,
            outcome: parsed.outcome,
            purpose: parsed.purpose ?? undefined,
            notes: parsed.notes ?? undefined,
            calledAt: new Date(parsed.calledAt).toISOString(),
            nextFollowUpAt: parsed.nextFollowUpAt
              ? String(parsed.nextFollowUpAt).slice(0, 10)
              : null,
            customerName: parsed.customerName ?? undefined,
            governorate: parsed.governorate ?? undefined,
            cafeName: parsed.cafeName ?? undefined,
            otherContactNumbers: parsed.otherContactNumbers ?? undefined,
          };
        } catch {
          lastCall = null;
        }
      }

      const segments = computeSegments({
        planName: row.planName,
        menusCount: Number(row.menusCount ?? 0),
        createdAt: row.createdAt,
        lastLoginAt: row.lastLoginAt,
        endDate: row.endDate,
        nextFollowUpAt: row.nextFollowUpAt,
      });

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phoneNumber: row.phoneNumber ?? null,
        planName: row.planName ?? "Free",
        menusCount: Number(row.menusCount ?? 0),
        lastLoginAt: row.lastLoginAt
          ? new Date(row.lastLoginAt).toISOString()
          : null,
        endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
        createdAt: new Date(row.createdAt).toISOString(),
        lastCall,
        nextFollowUpAt: row.nextFollowUpAt
          ? String(row.nextFollowUpAt).slice(0, 10)
          : null,
        segments,
      };
    })
    .filter((u) => segment === "all" || u.segments.includes(segment));

  return { users };
}

export async function listFollowUpCalls(filters: {
  userId?: number;
  adminName?: string;
  from?: string;
  to?: string;
}) {
  const pool = await getPool();
  const request = pool.request();
  const conditions: string[] = [];

  if (filters.userId) {
    conditions.push("c.userId = @userId");
    request.input("userId", sql.Int, filters.userId);
  }
  if (filters.adminName?.trim()) {
    conditions.push("c.adminName = @adminName");
    request.input("adminName", sql.NVarChar, filters.adminName.trim());
  }
  if (filters.from) {
    conditions.push("c.calledAt >= @from");
    request.input("from", sql.DateTime2, new Date(filters.from));
  }
  if (filters.to) {
    conditions.push("c.calledAt <= @to");
    request.input("to", sql.DateTime2, new Date(filters.to));
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await request.query(`
    SELECT
      c.id, c.userId, c.adminName, c.outcome, c.purpose, c.notes,
      c.calledAt, c.nextFollowUpAt,
      c.customerName, c.governorate, c.cafeName, c.otherContactNumbers,
      u.name AS userName, u.phoneNumber
    FROM AdminFollowUpCalls c
    LEFT JOIN Users u ON u.id = c.userId
    ${where}
    ORDER BY c.calledAt DESC
  `);

  return {
    calls: result.recordset.map((row) => mapFollowUpCallRow(row)),
  };
}

export async function deleteFollowUpCall(callId: string): Promise<void> {
  const id = callId.trim();
  if (!id) {
    throw new Error("Call not found");
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.NVarChar, id)
    .query(`
      DELETE FROM AdminFollowUpCalls
      WHERE id = @id
    `);

  if (!result.rowsAffected[0]) {
    throw new Error("Call not found");
  }
}

export async function createFollowUpCall(
  payload: {
    userId: number;
    outcome: string;
    purpose?: string;
    notes?: string;
    nextFollowUpAt?: string | null;
    agentName?: string;
  } & FollowUpCallContactFields,
  adminId?: number,
) {
  if (!VALID_OUTCOMES.has(payload.outcome)) {
    throw new Error("Invalid outcome");
  }
  if (payload.purpose && !VALID_PURPOSES.has(payload.purpose)) {
    throw new Error("Invalid purpose");
  }

  const purpose = payload.purpose || undefined;
  const contact = normalizeContactFields(payload);

  const pool = await getPool();
  const userCheck = await pool
    .request()
    .input("userId", sql.Int, payload.userId)
    .query(`SELECT id, name FROM Users WHERE id = @userId AND role = 'user'`);

  if (!userCheck.recordset.length) {
    throw new Error("User not found");
  }

  const adminName = (payload.agentName ?? "Admin").trim().slice(0, 255);
  const id = crypto.randomUUID();
  const nextDate = payload.nextFollowUpAt
    ? payload.nextFollowUpAt.slice(0, 10)
    : null;

  await pool
    .request()
    .input("id", sql.NVarChar, id)
    .input("userId", sql.Int, payload.userId)
    .input("adminId", sql.Int, adminId ?? null)
    .input("adminName", sql.NVarChar, adminName)
    .input("outcome", sql.NVarChar, payload.outcome)
    .input("purpose", sql.NVarChar, purpose ?? null)
    .input("notes", sql.NVarChar(sql.MAX), payload.notes ?? null)
    .input("customerName", sql.NVarChar, contact.customerName ?? null)
    .input("governorate", sql.NVarChar, contact.governorate ?? null)
    .input("cafeName", sql.NVarChar, contact.cafeName ?? null)
    .input(
      "otherContactNumbers",
      sql.NVarChar(sql.MAX),
      contact.otherContactNumbers ?? null,
    )
    .input("nextFollowUpAt", sql.Date, nextDate)
    .query(`
      INSERT INTO AdminFollowUpCalls (
        id, userId, adminId, adminName, outcome, purpose, notes,
        customerName, governorate, cafeName, otherContactNumbers,
        nextFollowUpAt
      )
      VALUES (
        @id, @userId, @adminId, @adminName, @outcome, @purpose, @notes,
        @customerName, @governorate, @cafeName, @otherContactNumbers,
        @nextFollowUpAt
      )
    `);

  return {
    call: {
      id,
      userId: payload.userId,
      userName: userCheck.recordset[0].name,
      adminName,
      outcome: payload.outcome,
      purpose,
      notes: payload.notes,
      calledAt: new Date().toISOString(),
      nextFollowUpAt: nextDate,
      ...contact,
    },
  };
}

export async function updateFollowUpCall(
  callId: string,
  payload: {
    outcome: string;
    purpose?: string;
    notes?: string;
    nextFollowUpAt?: string | null;
    agentName?: string;
  } & FollowUpCallContactFields,
) {
  const id = callId.trim();
  if (!id) {
    throw new Error("Call not found");
  }
  if (!VALID_OUTCOMES.has(payload.outcome)) {
    throw new Error("Invalid outcome");
  }
  if (payload.purpose && !VALID_PURPOSES.has(payload.purpose)) {
    throw new Error("Invalid purpose");
  }

  const pool = await getPool();
  const existing = await pool
    .request()
    .input("id", sql.NVarChar, id)
    .query(`
      SELECT c.id, c.userId, c.calledAt, u.name AS userName
      FROM AdminFollowUpCalls c
      LEFT JOIN Users u ON u.id = c.userId
      WHERE c.id = @id
    `);

  if (!existing.recordset.length) {
    throw new Error("Call not found");
  }

  const row = existing.recordset[0];
  const adminName = (payload.agentName ?? "Admin").trim().slice(0, 255);
  const purpose = payload.purpose || null;
  const contact = normalizeContactFields(payload);
  const nextDate = payload.nextFollowUpAt
    ? payload.nextFollowUpAt.slice(0, 10)
    : null;

  await pool
    .request()
    .input("id", sql.NVarChar, id)
    .input("adminName", sql.NVarChar, adminName)
    .input("outcome", sql.NVarChar, payload.outcome)
    .input("purpose", sql.NVarChar, purpose)
    .input("notes", sql.NVarChar(sql.MAX), payload.notes ?? null)
    .input("customerName", sql.NVarChar, contact.customerName ?? null)
    .input("governorate", sql.NVarChar, contact.governorate ?? null)
    .input("cafeName", sql.NVarChar, contact.cafeName ?? null)
    .input(
      "otherContactNumbers",
      sql.NVarChar(sql.MAX),
      contact.otherContactNumbers ?? null,
    )
    .input("nextFollowUpAt", sql.Date, nextDate)
    .query(`
      UPDATE AdminFollowUpCalls
      SET
        adminName = @adminName,
        outcome = @outcome,
        purpose = @purpose,
        notes = @notes,
        customerName = @customerName,
        governorate = @governorate,
        cafeName = @cafeName,
        otherContactNumbers = @otherContactNumbers,
        nextFollowUpAt = @nextFollowUpAt
      WHERE id = @id
    `);

  return {
    call: {
      id,
      userId: Number(row.userId),
      userName: row.userName ?? undefined,
      adminName,
      outcome: payload.outcome,
      purpose: purpose ?? undefined,
      notes: payload.notes,
      calledAt: new Date(row.calledAt).toISOString(),
      nextFollowUpAt: nextDate,
      ...contact,
    },
  };
}

export async function buildFollowUpReport(period: "7d" | "30d") {
  const pool = await getPool();
  const days = period === "30d" ? 30 : 7;

  const statsResult = await pool.request().input("days", sql.Int, days).query(`
    DECLARE @todayStart DATETIME2 = CAST(CAST(SYSUTCDATETIME() AS DATE) AS DATETIME2);
    DECLARE @weekStart DATETIME2 = DATEADD(day, -7, SYSUTCDATETIME());
    DECLARE @since DATETIME2 = DATEADD(day, -@days, SYSUTCDATETIME());

    SELECT
      (SELECT COUNT(*) FROM AdminFollowUpCalls WHERE calledAt >= @todayStart) AS callsToday,
      (SELECT COUNT(*) FROM AdminFollowUpCalls WHERE calledAt >= @weekStart) AS callsThisWeek,
      (
        SELECT COUNT(DISTINCT u.id)
        FROM Users u
        INNER JOIN (
          SELECT userId, MAX(nextFollowUpAt) AS nextFollowUpAt
          FROM AdminFollowUpCalls
          GROUP BY userId
        ) lc ON lc.userId = u.id
        WHERE lc.nextFollowUpAt IS NOT NULL AND lc.nextFollowUpAt < CAST(SYSUTCDATETIME() AS DATE)
      ) AS overdueCount,
      (
        SELECT CASE WHEN COUNT(*) = 0 THEN 0
          ELSE CAST(SUM(CASE WHEN outcome = 'answered' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100
        END
        FROM AdminFollowUpCalls
        WHERE calledAt >= @since
      ) AS answeredRate
  `);

  const stats = statsResult.recordset[0] ?? {};

  const byAdmin = await pool.request().input("days", sql.Int, days).query(`
    SELECT adminName, COUNT(*) AS count
    FROM AdminFollowUpCalls
    WHERE calledAt >= DATEADD(day, -@days, SYSUTCDATETIME())
    GROUP BY adminName
    ORDER BY count DESC
  `);

  const teamStatsResult = await pool.request().input("days", sql.Int, days).query(`
    SELECT
      adminName,
      COUNT(*) AS totalCalls,
      CASE WHEN COUNT(*) = 0 THEN 0
        ELSE CAST(SUM(CASE WHEN outcome = 'answered' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100
      END AS answeredRate,
      SUM(CASE WHEN nextFollowUpAt IS NOT NULL AND nextFollowUpAt < CAST(SYSUTCDATETIME() AS DATE) THEN 1 ELSE 0 END) AS overdueFollowUps,
      SUM(CASE WHEN purpose = 'upgrade_pro' THEN 1 ELSE 0 END) AS upgradeCalls,
      SUM(CASE WHEN purpose = 'onboarding' THEN 1 ELSE 0 END) AS onboardingCalls,
      SUM(CASE WHEN purpose = 'renewal' THEN 1 ELSE 0 END) AS renewalCalls,
      SUM(CASE WHEN outcome = 'callback_requested' THEN 1 ELSE 0 END) AS callbackRequested
    FROM AdminFollowUpCalls
    WHERE calledAt >= DATEADD(day, -@days, SYSUTCDATETIME())
    GROUP BY adminName
    ORDER BY totalCalls DESC
  `);

  const outcomesResult = await pool.request().input("days", sql.Int, days).query(`
    SELECT outcome, COUNT(*) AS count
    FROM AdminFollowUpCalls
    WHERE calledAt >= DATEADD(day, -@days, SYSUTCDATETIME())
    GROUP BY outcome
  `);

  const purposesResult = await pool.request().input("days", sql.Int, days).query(`
    SELECT purpose, COUNT(*) AS count
    FROM AdminFollowUpCalls
    WHERE calledAt >= DATEADD(day, -@days, SYSUTCDATETIME())
      AND purpose IS NOT NULL
    GROUP BY purpose
  `);

  return {
    period,
    callsToday: Number(stats.callsToday ?? 0),
    callsThisWeek: Number(stats.callsThisWeek ?? 0),
    overdueCount: Number(stats.overdueCount ?? 0),
    answeredRate: Math.round(Number(stats.answeredRate ?? 0)),
    callsByAdmin: byAdmin.recordset.map((r) => ({
      adminName: r.adminName,
      count: Number(r.count ?? 0),
    })),
    teamStats: teamStatsResult.recordset.map((r) => ({
      adminName: r.adminName,
      totalCalls: Number(r.totalCalls ?? 0),
      answeredRate: Math.round(Number(r.answeredRate ?? 0)),
      overdueFollowUps: Number(r.overdueFollowUps ?? 0),
      upgradeCalls: Number(r.upgradeCalls ?? 0),
      onboardingCalls: Number(r.onboardingCalls ?? 0),
      renewalCalls: Number(r.renewalCalls ?? 0),
      callbackRequested: Number(r.callbackRequested ?? 0),
    })),
    outcomesBreakdown: outcomesResult.recordset.map((r) => ({
      outcome: r.outcome,
      count: Number(r.count ?? 0),
    })),
    purposesBreakdown: purposesResult.recordset.map((r) => ({
      purpose: r.purpose,
      count: Number(r.count ?? 0),
    })),
  };
}
