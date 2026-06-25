export const USER_LIST_SUBSCRIPTION_JOIN = `
  LEFT JOIN Subscriptions s ON u.id = s.userId
    AND s.status = 'active'
    AND (s.endDate IS NULL OR s.endDate > GETDATE())
  LEFT JOIN Plans p ON s.planId = p.id`;

export const USER_FREE_PLAN_SQL = `(
  p.name IS NULL
  OR LOWER(ISNULL(p.name, '')) LIKE '%free%'
  OR p.name = N'مجاني'
  OR LOWER(ISNULL(p.name, '')) LIKE '%trial%'
  OR ISNULL(p.priceMonthly, 0) = 0
)`;

export const USER_PRO_PLAN_SQL = `(
  p.name IS NOT NULL
  AND LOWER(p.name) NOT LIKE '%free%'
  AND p.name <> N'مجاني'
  AND LOWER(p.name) NOT LIKE '%trial%'
  AND ISNULL(p.priceMonthly, 0) > 0
)`;

export const BROADCAST_AUDIENCES = [
  "all",
  "selected",
  "pro",
  "free",
  "no-menu",
  "with-menu",
] as const;

export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export function isBroadcastAudience(value: string): value is BroadcastAudience {
  return (BROADCAST_AUDIENCES as readonly string[]).includes(value);
}

export function getBaseBroadcastUserConditions(): string[] {
  return [
    "u.role = 'user'",
    "u.deletedAt IS NULL",
    "u.isSuspended = 0",
    "u.email IS NOT NULL",
    "LTRIM(RTRIM(u.email)) <> ''",
  ];
}

export function applyBroadcastAudienceFilter(
  audience: BroadcastAudience,
  whereConditions: string[],
): void {
  switch (audience) {
    case "pro":
      whereConditions.push(USER_PRO_PLAN_SQL);
      break;
    case "free":
      whereConditions.push(USER_FREE_PLAN_SQL);
      break;
    case "no-menu":
      whereConditions.push(
        "(SELECT COUNT(*) FROM Menus m WHERE m.userId = u.id) = 0",
      );
      break;
    case "with-menu":
      whereConditions.push(
        "(SELECT COUNT(*) FROM Menus m WHERE m.userId = u.id) > 0",
      );
      break;
    case "all":
    case "selected":
    default:
      break;
  }
}
