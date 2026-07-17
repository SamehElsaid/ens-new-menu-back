import { Request, Response } from "express";
import { STAFF_PERMISSIONS } from "../config/staffPermissions.catalog";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

/**
 * GET /api/staff-permissions/catalog
 *
 * Returns the static permission metadata (keys, labelKeys, groups, deps).
 * Frontend resolves human labels via next-intl using `labelKey`.
 */
export async function getStaffPermissionsCatalog(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const groups = Array.from(
      STAFF_PERMISSIONS.reduce((set, p) => set.add(p.group), new Set<string>()),
    );

    res.json({
      groups,
      permissions: STAFF_PERMISSIONS.map((p) => ({
        key: p.key,
        labelKey: p.labelKey,
        descriptionKey: p.descriptionKey,
        group: p.group,
        dependsOn: p.dependsOn,
      })),
    });
  } catch (error) {
    logger.error("Get staff permissions catalog error:", error);
    sendApiError(res, req, 500, ApiErrors.internalServerError);
  }
}
