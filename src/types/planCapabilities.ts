/** Theme ids available for plan gating — keep in sync with menuThemes ALLOWED_MENU_THEMES. */
export const PLAN_THEME_IDS = [
  "default",
  "coffee",
  "neon",
  "sky",
  "waffle",
  "vanilla",
  "onecard",
] as const;

export type PlanThemeId = (typeof PLAN_THEME_IDS)[number];

export type PlanCapabilities = {
  aiMenuImport: boolean;
  tableOrderingQr: boolean;
  liveOrderNotifications: boolean;
  staffAndTables: boolean;
  advancedDeliveryMaps: boolean;
  /** -1 = unlimited */
  maxAdsPerMenu: number;
  allowedThemes: string[];
};

export type BooleanCapabilityKey =
  | "aiMenuImport"
  | "tableOrderingQr"
  | "liveOrderNotifications"
  | "staffAndTables"
  | "advancedDeliveryMaps";

export const ALL_THEME_IDS: string[] = [...PLAN_THEME_IDS];

export const FREE_PLAN_CAPABILITIES_DEFAULT: PlanCapabilities = {
  aiMenuImport: true,
  tableOrderingQr: false,
  liveOrderNotifications: false,
  staffAndTables: false,
  advancedDeliveryMaps: false,
  maxAdsPerMenu: 1,
  allowedThemes: ["default", "coffee"],
};

export const PRO_PLAN_CAPABILITIES_DEFAULT: PlanCapabilities = {
  aiMenuImport: true,
  tableOrderingQr: true,
  liveOrderNotifications: true,
  staffAndTables: true,
  advancedDeliveryMaps: true,
  maxAdsPerMenu: -1,
  allowedThemes: [...ALL_THEME_IDS],
};

/** Marketing-only Custom column defaults (not enforced at runtime). */
export const CUSTOM_DISPLAY_CAPABILITIES_DEFAULT: PlanCapabilities = {
  aiMenuImport: true,
  tableOrderingQr: true,
  liveOrderNotifications: true,
  staffAndTables: true,
  advancedDeliveryMaps: true,
  maxAdsPerMenu: -1,
  allowedThemes: [...ALL_THEME_IDS],
};
