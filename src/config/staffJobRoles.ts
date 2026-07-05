/** Job title for menu staff (distinct from JWT auth role `staff`). */
export const STAFF_JOB_WAITER = "waiter";
export const STAFF_JOB_CASHIER = "cashier";

const ALLOWED = new Set([STAFF_JOB_WAITER, STAFF_JOB_CASHIER]);

/** Accepts common typo "casher" → cashier. */
export function normalizeStaffJobRole(input: unknown): string | null {
  if (input == null || input === "") return null;
  const s = String(input).trim().toLowerCase();
  if (s === "casher") return STAFF_JOB_CASHIER;
  if (ALLOWED.has(s)) return s;
  return null;
}

export function parseStaffJobRoleOrError(
  input: unknown,
): { ok: true; value: string } | { ok: false } {
  const n = normalizeStaffJobRole(input);
  if (!n) return { ok: false };
  return { ok: true, value: n };
}

export function isStaffCashierDbRole(role: unknown): boolean {
  const n = normalizeStaffJobRole(role);
  return n === STAFF_JOB_CASHIER;
}

export function isStaffWaiterRole(role: unknown): boolean {
  return normalizeStaffJobRole(role) === STAFF_JOB_WAITER;
}

/** Owner/admin (non-staff JWT) may finish orders; staff cashiers only among staff. */
export function canStaffFinishOrders(
  staffJobRole: string | null | undefined,
  actorRole: string,
): boolean {
  if (actorRole !== "staff") return true;
  return isStaffCashierDbRole(staffJobRole);
}
