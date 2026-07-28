/**
 * Staff, roles and menu grants are account-level, but `MenuAuditLog` is keyed
 * by menu — so an account change is recorded once per menu it touches, giving
 * every affected menu a complete trail of who changed what.
 */
import type { Request } from "express";
import { logMenuActivitySafe } from "./menuActivityLog.service";
import { listOwnerMenuIds } from "./staffMenuGrants.service";
import { logger } from "../utils/logger";

export type AccountStaffAuditEntry = {
  action: string;
  targetType: "staff" | "staff_role";
  targetId: number | null;
  summaryAr: string;
  summaryEn: string;
  /** State before the change — omitted for creations. */
  before?: unknown;
  /** State after the change — omitted for deletions. */
  after?: unknown;
};

/**
 * @param menuIds Menus whose trail should show the change (union of the grants
 * before and after, so revocations are visible on the menu that lost the staff).
 */
export async function logAccountStaffActivity(
  req: Request,
  ownerUserId: number,
  menuIds: number[],
  entry: AccountStaffAuditEntry,
): Promise<void> {
  try {
    const actorId = req.user?.userId ?? null;
    const targets = [...new Set(menuIds)].filter(
      (id) => Number.isFinite(id) && id > 0,
    );

    // A staff member with no menus would otherwise leave no trail at all.
    const fallback =
      targets.length > 0 ? targets : (await listOwnerMenuIds(ownerUserId)).slice(0, 1);

    const detailJson = JSON.stringify({
      actorId,
      ownerUserId,
      targetStaffId: entry.targetType === "staff" ? entry.targetId : undefined,
      before: entry.before ?? null,
      after: entry.after ?? null,
      menuIds: targets,
    });

    for (const menuId of fallback) {
      await logMenuActivitySafe(req, menuId, {
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? undefined,
        summaryAr: entry.summaryAr,
        summaryEn: entry.summaryEn,
        detailJson,
      });
    }
  } catch (error) {
    logger.warn("logAccountStaffActivity skipped", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
