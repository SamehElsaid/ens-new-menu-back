/**
 * Static catalog of staff RBAC permissions (metadata source of truth).
 *
 * Roles are dynamic (per-menu CRUD), but the set of assignable permissions is
 * fixed here in code — mirroring the AdminPermissions pattern. The catalog is
 * consumed by validation, the roles CRUD, the frontend editor and Swagger.
 */

export type StaffPermissionGroup =
  | "orders"
  | "menu"
  | "dashboard"
  | "delivery"
  | "staff"
  | "settings"
  | "analytics"
  | "ads";

export interface StaffPermissionMeta {
  /** Stable permission key, e.g. `orders:complete`. */
  key: string;
  /** next-intl key for the human label (frontend resolves it). */
  labelKey: string;
  /** next-intl key for an optional longer description. */
  descriptionKey: string;
  /** UI grouping. */
  group: StaffPermissionGroup;
  /** Permissions implicitly required by this one (auto-included on save). */
  dependsOn: string[];
}

/**
 * Permissions kept in the catalog for backwards compatibility but no longer
 * enforced: every staff member may sign in from either surface and open the
 * dashboard shell. What they can actually do inside is still decided by the
 * specific permissions (`orders:view`, `staff:manage`, …) plus their menu
 * grants, so treating these as always granted widens nothing real.
 */
export const NON_GATING_PERMISSIONS: ReadonlySet<string> = new Set([
  "dashboard:access",
]);

export function isNonGatingPermission(permission: string): boolean {
  return NON_GATING_PERMISSIONS.has(permission);
}

export const STAFF_PERMISSIONS: readonly StaffPermissionMeta[] = [
  // ── Orders ──────────────────────────────────────────────────────────
  {
    key: "orders:view",
    labelKey: "StaffPermissions.keys.orders:view",
    descriptionKey: "StaffPermissions.descriptions.orders:view",
    group: "orders",
    dependsOn: [] as string[],
  },
  {
    key: "orders:confirm",
    labelKey: "StaffPermissions.keys.orders:confirm",
    descriptionKey: "StaffPermissions.descriptions.orders:confirm",
    group: "orders",
    // No dependsOn on orders:view — online-only roles use delivery:view instead.
    dependsOn: [] as string[],
  },
  {
    key: "orders:cancel",
    labelKey: "StaffPermissions.keys.orders:cancel",
    descriptionKey: "StaffPermissions.descriptions.orders:cancel",
    group: "orders",
    dependsOn: [] as string[],
  },
  {
    key: "orders:edit_items",
    labelKey: "StaffPermissions.keys.orders:edit_items",
    descriptionKey: "StaffPermissions.descriptions.orders:edit_items",
    group: "orders",
    dependsOn: [] as string[],
  },
  {
    key: "orders:prepare",
    labelKey: "StaffPermissions.keys.orders:prepare",
    descriptionKey: "StaffPermissions.descriptions.orders:prepare",
    group: "orders",
    dependsOn: [] as string[],
  },
  {
    key: "orders:deliver",
    labelKey: "StaffPermissions.keys.orders:deliver",
    descriptionKey: "StaffPermissions.descriptions.orders:deliver",
    group: "orders",
    dependsOn: [] as string[],
  },
  {
    key: "orders:complete",
    labelKey: "StaffPermissions.keys.orders:complete",
    descriptionKey: "StaffPermissions.descriptions.orders:complete",
    group: "orders",
    dependsOn: ["orders:confirm"] as string[],
  },
  // ── Dashboard ───────────────────────────────────────────────────────
  {
    key: "dashboard:access",
    labelKey: "StaffPermissions.keys.dashboard:access",
    descriptionKey: "StaffPermissions.descriptions.dashboard:access",
    group: "dashboard",
    dependsOn: [] as string[],
  },
  // ── Menu ────────────────────────────────────────────────────────────
  {
    key: "menu:view",
    labelKey: "StaffPermissions.keys.menu:view",
    descriptionKey: "StaffPermissions.descriptions.menu:view",
    group: "menu",
    dependsOn: ["dashboard:access"] as string[],
  },
  {
    key: "menu:categories",
    labelKey: "StaffPermissions.keys.menu:categories",
    descriptionKey: "StaffPermissions.descriptions.menu:categories",
    group: "menu",
    dependsOn: ["dashboard:access", "menu:view"] as string[],
  },
  {
    key: "menu:items",
    labelKey: "StaffPermissions.keys.menu:items",
    descriptionKey: "StaffPermissions.descriptions.menu:items",
    group: "menu",
    dependsOn: ["dashboard:access", "menu:view"] as string[],
  },
  {
    key: "menu:tables",
    labelKey: "StaffPermissions.keys.menu:tables",
    descriptionKey: "StaffPermissions.descriptions.menu:tables",
    group: "menu",
    dependsOn: ["dashboard:access", "menu:view"] as string[],
  },
  {
    key: "menu:import",
    labelKey: "StaffPermissions.keys.menu:import",
    descriptionKey: "StaffPermissions.descriptions.menu:import",
    group: "menu",
    dependsOn: ["dashboard:access", "menu:view"] as string[],
  },
  // ── Delivery ────────────────────────────────────────────────────────
  {
    key: "delivery:view",
    labelKey: "StaffPermissions.keys.delivery:view",
    descriptionKey: "StaffPermissions.descriptions.delivery:view",
    group: "delivery",
    // Usable by staff_app roles (food preparer / delivery) without forcing
    // dashboard:access into the role JSON / loginPortal backfill.
    dependsOn: [] as string[],
  },
  // ── Staff ───────────────────────────────────────────────────────────
  {
    key: "staff:manage",
    labelKey: "StaffPermissions.keys.staff:manage",
    descriptionKey: "StaffPermissions.descriptions.staff:manage",
    group: "staff",
    dependsOn: ["dashboard:access"] as string[],
  },
  // ── Settings ────────────────────────────────────────────────────────
  {
    key: "settings:manage",
    labelKey: "StaffPermissions.keys.settings:manage",
    descriptionKey: "StaffPermissions.descriptions.settings:manage",
    group: "settings",
    dependsOn: ["dashboard:access"] as string[],
  },
  // ── Analytics ───────────────────────────────────────────────────────
  {
    key: "analytics:view",
    labelKey: "StaffPermissions.keys.analytics:view",
    descriptionKey: "StaffPermissions.descriptions.analytics:view",
    group: "analytics",
    dependsOn: ["dashboard:access"] as string[],
  },
  // ── Ads ─────────────────────────────────────────────────────────────
  {
    key: "ads:manage",
    labelKey: "StaffPermissions.keys.ads:manage",
    descriptionKey: "StaffPermissions.descriptions.ads:manage",
    group: "ads",
    dependsOn: ["dashboard:access"] as string[],
  },
] as const;

export type StaffPermissionKey = (typeof STAFF_PERMISSIONS)[number]["key"];

const PERMISSION_BY_KEY = new Map<string, StaffPermissionMeta>(
  STAFF_PERMISSIONS.map((p) => [p.key, p]),
);

export const ALL_STAFF_PERMISSION_KEYS: readonly string[] =
  STAFF_PERMISSIONS.map((p) => p.key);

export function isValidStaffPermission(key: unknown): key is StaffPermissionKey {
  return typeof key === "string" && PERMISSION_BY_KEY.has(key);
}

export function getStaffPermissionMeta(
  key: string,
): StaffPermissionMeta | undefined {
  return PERMISSION_BY_KEY.get(key);
}

/**
 * Expands a set of permission keys to also include every transitive dependency.
 * Order is stable to catalog order. Unknown keys are dropped by the caller via
 * validation; here they are simply ignored.
 */
export function expandPermissionsWithDependencies(
  keys: readonly string[],
): string[] {
  const resolved = new Set<string>();

  const visit = (key: string): void => {
    if (resolved.has(key)) return;
    const meta = PERMISSION_BY_KEY.get(key);
    if (!meta) return;
    resolved.add(key);
    for (const dep of meta.dependsOn) {
      visit(dep);
    }
  };

  for (const key of keys) {
    visit(key);
  }

  // Return in catalog order for deterministic output.
  return STAFF_PERMISSIONS.filter((p) => resolved.has(p.key)).map((p) => p.key);
}

/**
 * Splits incoming keys into valid/unknown buckets (no dependency expansion).
 */
export function partitionPermissionKeys(input: unknown): {
  valid: string[];
  unknown: string[];
} {
  const valid: string[] = [];
  const unknown: string[] = [];
  if (!Array.isArray(input)) {
    return { valid, unknown };
  }
  const seen = new Set<string>();
  for (const raw of input) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (PERMISSION_BY_KEY.has(key)) {
      valid.push(key);
    } else {
      unknown.push(key);
    }
  }
  return { valid, unknown };
}
