/** Job title for menu staff (distinct from JWT auth role `staff`). */
export const STAFF_JOB_WAITER = "waiter";

const ALLOWED = new Set([STAFF_JOB_WAITER]);

/** Legacy "cashier"/"casher" DB values normalize to waiter. */
export function normalizeStaffJobRole(input: unknown): string | null {
  if (input == null || input === "") return null;
  const s = String(input).trim().toLowerCase();
  if (s === "casher" || s === "cashier") return STAFF_JOB_WAITER;
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
