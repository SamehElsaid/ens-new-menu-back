import type { Request, Response, NextFunction } from "express";
import { resolveMenuNumericId, isMenuIdentifier } from "../utils/menuIdentifier";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

/** Express param handler: converts UUID (or legacy numeric id) to internal Menus.id string. */
export async function resolveMenuParam(
  req: Request,
  res: Response,
  next: NextFunction,
  value: string,
  name: string,
): Promise<void> {
  try {
    if (!isMenuIdentifier(value)) {
      sendApiError(res, req, 400, ApiErrors.menuNotFound);
      return;
    }

    const numericId = await resolveMenuNumericId(value);
    if (numericId == null) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    req.params[name] = String(numericId);
    next();
  } catch (error) {
    next(error);
  }
}

/** For top-level /api/menus/:id routes (not activity-log :id). */
export async function resolveMenuIdRouteParam(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const value = req.params.id ?? "";
  await resolveMenuParam(req, res, next, value, "id");
}
