import { getPool, sql } from "../config/database";
import { ensurePlanCapabilitiesSchema } from "../schemas/planCapabilities.schema";
import {
  ALL_THEME_IDS,
  FREE_PLAN_CAPABILITIES_DEFAULT,
  PRO_PLAN_CAPABILITIES_DEFAULT,
  CUSTOM_DISPLAY_CAPABILITIES_DEFAULT,
  type BooleanCapabilityKey,
  type PlanCapabilities,
} from "../types/planCapabilities";

const BOOL_KEYS: BooleanCapabilityKey[] = [
  "aiMenuImport",
  "tableOrderingQr",
  "liveOrderNotifications",
  "staffAndTables",
  "advancedDeliveryMaps",
];

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function asInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function asThemeList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const allowed = new Set(ALL_THEME_IDS);
  const out: string[] = [];
  for (const item of value) {
    const id = String(item ?? "").trim();
    if (id && allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out.length > 0 ? out : [...fallback];
}

/** Normalize unknown JSON into a full PlanCapabilities object. */
export function parsePlanCapabilities(
  raw: unknown,
  fallback: PlanCapabilities = FREE_PLAN_CAPABILITIES_DEFAULT,
): PlanCapabilities {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      return { ...fallback, allowedThemes: [...fallback.allowedThemes] };
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else {
    return { ...fallback, allowedThemes: [...fallback.allowedThemes] };
  }

  return {
    aiMenuImport: asBool(obj.aiMenuImport, fallback.aiMenuImport),
    tableOrderingQr: asBool(obj.tableOrderingQr, fallback.tableOrderingQr),
    liveOrderNotifications: asBool(
      obj.liveOrderNotifications,
      fallback.liveOrderNotifications,
    ),
    staffAndTables: asBool(obj.staffAndTables, fallback.staffAndTables),
    advancedDeliveryMaps: asBool(
      obj.advancedDeliveryMaps,
      fallback.advancedDeliveryMaps,
    ),
    maxAdsPerMenu: asInt(obj.maxAdsPerMenu, fallback.maxAdsPerMenu),
    allowedThemes: asThemeList(obj.allowedThemes, fallback.allowedThemes),
  };
}

/** Validate and normalize an admin payload (partial merge not here — full object). */
export function normalizeCapabilitiesInput(
  raw: unknown,
  fallback: PlanCapabilities = FREE_PLAN_CAPABILITIES_DEFAULT,
): PlanCapabilities {
  return parsePlanCapabilities(raw, fallback);
}

function defaultsForPlanName(name: string): PlanCapabilities {
  const n = name.trim().toLowerCase();
  if (n === "free") return FREE_PLAN_CAPABILITIES_DEFAULT;
  if (n === "pro") return PRO_PLAN_CAPABILITIES_DEFAULT;
  return PRO_PLAN_CAPABILITIES_DEFAULT;
}

export async function getFreePlanCapabilities(): Promise<PlanCapabilities> {
  await ensurePlanCapabilitiesSchema();
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TOP 1 capabilities, name
    FROM Plans
    WHERE LOWER(LTRIM(RTRIM(name))) = N'free'
    ORDER BY id ASC
  `);
  const row = result.recordset[0];
  if (!row) return { ...FREE_PLAN_CAPABILITIES_DEFAULT };
  return parsePlanCapabilities(
    row.capabilities,
    defaultsForPlanName(String(row.name ?? "free")),
  );
}

export async function getPlanCapabilitiesByPlanId(
  planId: number,
): Promise<PlanCapabilities> {
  await ensurePlanCapabilitiesSchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("planId", sql.Int, planId)
    .query(`
      SELECT capabilities, name FROM Plans WHERE id = @planId
    `);
  const row = result.recordset[0];
  if (!row) return { ...FREE_PLAN_CAPABILITIES_DEFAULT };
  return parsePlanCapabilities(
    row.capabilities,
    defaultsForPlanName(String(row.name ?? "")),
  );
}

export type UserPlanCapabilitiesResult = {
  planId: number | null;
  planName: string;
  capabilities: PlanCapabilities;
};

/** Active subscription plan capabilities, or Free plan defaults. */
export async function getUserPlanCapabilities(
  userId: number,
): Promise<UserPlanCapabilitiesResult> {
  await ensurePlanCapabilitiesSchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .query(`
      SELECT TOP 1
        p.id AS planId,
        p.name AS planName,
        p.capabilities
      FROM Subscriptions s
      JOIN Plans p ON s.planId = p.id
      WHERE s.userId = @userId
        AND s.status = 'active'
        AND (s.endDate IS NULL OR s.endDate > GETDATE())
      ORDER BY s.id DESC
    `);

  if (result.recordset.length === 0) {
    const caps = await getFreePlanCapabilities();
    return { planId: null, planName: "Free", capabilities: caps };
  }

  const row = result.recordset[0];
  const planName = String(row.planName ?? "Free");
  if (planName.trim().toLowerCase() === "free") {
    return {
      planId: Number(row.planId),
      planName,
      capabilities: parsePlanCapabilities(
        row.capabilities,
        FREE_PLAN_CAPABILITIES_DEFAULT,
      ),
    };
  }

  return {
    planId: Number(row.planId),
    planName,
    capabilities: parsePlanCapabilities(
      row.capabilities,
      defaultsForPlanName(planName),
    ),
  };
}

export async function hasCapability(
  userId: number,
  key: BooleanCapabilityKey,
): Promise<boolean> {
  const { capabilities } = await getUserPlanCapabilities(userId);
  return Boolean(capabilities[key]);
}

export async function getMaxAdsPerMenuForUser(userId: number): Promise<number> {
  const { capabilities } = await getUserPlanCapabilities(userId);
  return capabilities.maxAdsPerMenu;
}

export async function isThemeAllowedForUser(
  userId: number,
  themeId: string,
): Promise<boolean> {
  const { capabilities } = await getUserPlanCapabilities(userId);
  const id = String(themeId ?? "").trim();
  return capabilities.allowedThemes.includes(id);
}

export async function menuOwnerHasCapability(
  menuId: number,
  key: BooleanCapabilityKey,
): Promise<boolean> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("menuId", sql.Int, menuId)
    .query(`SELECT userId FROM Menus WHERE id = @menuId`);
  const uid = r.recordset[0]?.userId as number | undefined;
  if (uid == null) return false;
  return hasCapability(uid, key);
}

export async function getCustomPlanDisplay(): Promise<PlanCapabilities> {
  await ensurePlanCapabilitiesSchema();
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TOP 1 capabilities FROM PlanCustomDisplay WHERE id = 1
  `);
  const raw = result.recordset[0]?.capabilities;
  return parsePlanCapabilities(raw, CUSTOM_DISPLAY_CAPABILITIES_DEFAULT);
}

export async function updateCustomPlanDisplay(
  raw: unknown,
): Promise<PlanCapabilities> {
  await ensurePlanCapabilitiesSchema();
  const caps = normalizeCapabilitiesInput(
    raw,
    CUSTOM_DISPLAY_CAPABILITIES_DEFAULT,
  );
  const pool = await getPool();
  await pool
    .request()
    .input("caps", sql.NVarChar(sql.MAX), JSON.stringify(caps))
    .query(`
      IF EXISTS (SELECT 1 FROM PlanCustomDisplay WHERE id = 1)
        UPDATE PlanCustomDisplay
        SET capabilities = @caps, updatedAt = SYSUTCDATETIME()
        WHERE id = 1;
      ELSE
        INSERT INTO PlanCustomDisplay (id, capabilities) VALUES (1, @caps);
    `);
  return caps;
}

export function capabilitiesToJson(caps: PlanCapabilities): string {
  return JSON.stringify(normalizeCapabilitiesInput(caps));
}

export { BOOL_KEYS };
