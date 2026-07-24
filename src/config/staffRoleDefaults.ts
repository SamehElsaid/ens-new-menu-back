/**
 * Default staff roles seeded per-menu and used to migrate legacy
 * `waiter` / `cashier` text roles into the dynamic RBAC model.
 *
 * Roles are split across two login portals:
 *  - `staff_app`: operational staff that sign in from the staff mobile app
 *    (ويتر / محضر طعام / ديلفري). They must NOT have `dashboard:access`.
 *  - `dashboard`: back-office staff that sign in from the dashboard login page
 *    (كاشير / محاسب / مدير المطعم). They carry `dashboard:access`.
 *
 * Permission keys must exist in `staffPermissions.catalog.ts`.
 */
import { expandPermissionsWithDependencies } from "./staffPermissions.catalog";

export type StaffLoginPortal = "staff_app" | "dashboard";

export type DefaultRoleSlug =
  | "waiter"
  | "food_preparer"
  | "delivery"
  | "cashier";

export interface DefaultRoleDef {
  slug: DefaultRoleSlug;
  nameAr: string;
  nameEn: string;
  permissions: readonly string[];
  /** Which login surface this role can use. */
  loginPortal: StaffLoginPortal;
  /** Legacy `MenuStaff.role` text values that map to this role. */
  legacyRoleValues: readonly string[];
}

// ── Staff-app roles (no dashboard access) ──────────────────────────────
const WAITER_PERMISSIONS = [
  "orders:view",
  "orders:confirm",
  "orders:cancel",
  "orders:edit_items",
];

const FOOD_PREPARER_PERMISSIONS = ["orders:view", "orders:prepare"];

const DELIVERY_PERMISSIONS = [
  "orders:view",
  "orders:deliver",
  "orders:complete",
];

// ── Dashboard roles (carry dashboard:access) ───────────────────────────
const CASHIER_PERMISSIONS = [
  "orders:view",
  "orders:confirm",
  "orders:cancel",
  "orders:edit_items",
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

// const ACCOUNTANT_PERMISSIONS = [
//   "dashboard:access",
//   "orders:view",
//   "menu:view",
//   "delivery:view",
//   "analytics:view",
// ];

// const RESTAURANT_MANAGER_PERMISSIONS = [
//   "dashboard:access",
//   "orders:view",
//   "orders:confirm",
//   "orders:cancel",
//   "orders:edit_items",
//   "orders:prepare",
//   "orders:deliver",
//   "orders:complete",
//   "menu:view",
//   "menu:categories",
//   "menu:items",
//   "menu:tables",
//   "menu:import",
//   "delivery:view",
//   "staff:manage",
//   "settings:manage",
//   "analytics:view",
//   "ads:manage",
// ];

export const DEFAULT_STAFF_ROLES: readonly DefaultRoleDef[] = [
  {
    slug: "waiter",
    nameAr: "ويتر",
    nameEn: "Waiter",
    permissions: expandPermissionsWithDependencies(WAITER_PERMISSIONS),
    loginPortal: "staff_app",
    legacyRoleValues: ["waiter"],
  },
  {
    slug: "food_preparer",
    nameAr: "محضر طعام",
    nameEn: "Food preparer",
    permissions: expandPermissionsWithDependencies(FOOD_PREPARER_PERMISSIONS),
    loginPortal: "staff_app",
    legacyRoleValues: [],
  },
  {
    slug: "delivery",
    nameAr: "ديلفري",
    nameEn: "Delivery",
    permissions: expandPermissionsWithDependencies(DELIVERY_PERMISSIONS),
    loginPortal: "staff_app",
    legacyRoleValues: ["delivery"],
  },
  {
    slug: "cashier",
    nameAr: "كاشير",
    nameEn: "Cashier",
    permissions: expandPermissionsWithDependencies(CASHIER_PERMISSIONS),
    loginPortal: "dashboard",
    legacyRoleValues: ["cashier", "casher"],
  },

  // {
  //   slug: "accountant",
  //   nameAr: "محاسب",
  //   nameEn: "Accountant",
  //   permissions: expandPermissionsWithDependencies(ACCOUNTANT_PERMISSIONS),
  //   loginPortal: "dashboard",
  //   legacyRoleValues: [],
  // },
  // {
  //   slug: "restaurant_manager",
  //   nameAr: "مدير المطعم",
  //   nameEn: "Restaurant manager",
  //   permissions: expandPermissionsWithDependencies(
  //     RESTAURANT_MANAGER_PERMISSIONS,
  //   ),
  //   loginPortal: "dashboard",
  //   legacyRoleValues: [],
  // },
] as const;

/** Default role name (Arabic display) used for legacy staff without a match. */
export const FALLBACK_DEFAULT_ROLE_SLUG: DefaultRoleSlug = "waiter";
