/**
 * Default staff roles seeded per-menu and used to migrate legacy
 * `waiter` / `cashier` text roles into the dynamic RBAC model.
 *
 * Permission keys must exist in `staffPermissions.catalog.ts`.
 */
import { expandPermissionsWithDependencies } from "./staffPermissions.catalog";

export type DefaultRoleSlug = "waiter" | "cashier" | "food_preparer";

export interface DefaultRoleDef {
  slug: DefaultRoleSlug;
  nameAr: string;
  nameEn: string;
  permissions: string[];
  /** Legacy `MenuStaff.role` text values that map to this role. */
  legacyRoleValues: string[];
}

const WAITER_PERMISSIONS = [
  "orders:view",
  "orders:confirm",
  "orders:cancel",
  "orders:edit_items",
];

const CASHIER_PERMISSIONS = [
  ...WAITER_PERMISSIONS,
  "orders:prepare",
  "orders:deliver",
  "orders:complete",
  "dashboard:access",
  "menu:view",
  "menu:categories",
  "menu:items",
  "menu:tables",
  "menu:import",
  "delivery:view",
];

const FOOD_PREPARER_PERMISSIONS = ["orders:view", "orders:prepare"];

export const DEFAULT_STAFF_ROLES: readonly DefaultRoleDef[] = [
  {
    slug: "waiter",
    nameAr: "نادل",
    nameEn: "Waiter",
    permissions: expandPermissionsWithDependencies(WAITER_PERMISSIONS),
    legacyRoleValues: ["waiter"],
  },
  {
    slug: "cashier",
    nameAr: "كاشير",
    nameEn: "Cashier",
    permissions: expandPermissionsWithDependencies(CASHIER_PERMISSIONS),
    legacyRoleValues: ["cashier", "casher"],
  },
  {
    slug: "food_preparer",
    nameAr: "محضر طعام",
    nameEn: "Food preparer",
    permissions: expandPermissionsWithDependencies(FOOD_PREPARER_PERMISSIONS),
    legacyRoleValues: [],
  },
] as const;

/** Default role name (Arabic display) used for legacy staff without a match. */
export const FALLBACK_DEFAULT_ROLE_SLUG: DefaultRoleSlug = "waiter";
