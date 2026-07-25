import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { listAccessibleMenus } from "../services/staffMenuGrants.service";
import { menuOwnerHasCapability } from "../services/planCapabilities.service";

/**
 * GET /api/dashboard/menus
 * Menus the current actor may work on — every menu for an owner, only granted
 * menus for staff. Shared by the orders filter and the staff grants picker.
 */
export async function listDashboardMenusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const auth = req.user!;
    const menus = await listAccessibleMenus({
      userId: auth.userId,
      role: auth.role,
    });

    const withCapabilities = await Promise.all(
      menus.map(async (menu) => ({
        ...menu,
        capabilities: {
          tableOrderingQr: await menuOwnerHasCapability(
            menu.id,
            "tableOrderingQr",
          ),
          liveOrderNotifications: await menuOwnerHasCapability(
            menu.id,
            "liveOrderNotifications",
          ),
        },
      })),
    );

    res.json({ menus: withCapabilities });
  } catch (error) {
    logger.error("listDashboardMenusHandler error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetMenus);
  }
}
