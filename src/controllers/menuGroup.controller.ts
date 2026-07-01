import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import {
  createMenuGroup,
  deleteMenuGroup,
  addMenuToGroup,
  listUserMenuGroups,
  updateMenuGroup,
} from "../services/menuGroup.service";

function mapGroupError(
  res: Response,
  req: Request,
  code: string,
): void {
  switch (code) {
    case "PRO_REQUIRED":
      sendApiError(res, req, 403, ApiErrors.proFeatureOnly, {
        code: "PRO_REQUIRED",
      });
      return;
    case "MENUS_REQUIRED":
      sendApiError(res, req, 400, ApiErrors.menuGroupMenusRequired);
      return;
    case "MENU_NOT_FOUND":
      sendApiError(res, req, 400, ApiErrors.menuGroupMenuNotFound);
      return;
    case "MENU_IN_OTHER_GROUP":
      sendApiError(res, req, 400, ApiErrors.menuGroupMenuInOtherGroup);
      return;
    case "NOT_FOUND":
      sendApiError(res, req, 404, ApiErrors.menuGroupNotFound);
      return;
    default:
      sendApiError(res, req, 400, ApiErrors.validationFailed);
  }
}

export async function getMenuGroups(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const groups = await listUserMenuGroups(userId);
    res.json({ groups });
  } catch (error) {
    logger.error("Get menu groups error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetMenus);
  }
}

export async function postMenuGroup(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { name, menuIds } = req.body as {
      name?: string;
      menuIds?: number[];
    };

    const result = await createMenuGroup(
      userId,
      String(name ?? ""),
      Array.isArray(menuIds) ? menuIds.map(Number) : [],
    );

    if (!result.ok) {
      mapGroupError(res, req, result.code);
      return;
    }

    res.status(201).json({ group: result.group });
  } catch (error) {
    logger.error("Create menu group error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateMenu);
  }
}

export async function putMenuGroup(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const groupId = parseInt(req.params.groupId, 10);
    const { name, menuIds } = req.body as {
      name?: string;
      menuIds?: number[];
    };

    const result = await updateMenuGroup(userId, groupId, {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(menuIds !== undefined
        ? { menuIds: Array.isArray(menuIds) ? menuIds.map(Number) : [] }
        : {}),
    });

    if (!result.ok) {
      mapGroupError(res, req, result.code);
      return;
    }

    res.json({ group: result.group });
  } catch (error) {
    logger.error("Update menu group error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateMenu);
  }
}

export async function postMenuToGroup(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const groupId = parseInt(req.params.groupId, 10);
    const menuId = parseInt(String(req.body.menuId), 10);

    const result = await addMenuToGroup(userId, groupId, menuId);
    if (!result.ok) {
      mapGroupError(res, req, result.code);
      return;
    }

    res.status(200).json({ group: result.group });
  } catch (error) {
    logger.error("Add menu to group error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateMenu);
  }
}

export async function removeMenuGroup(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const groupId = parseInt(req.params.groupId, 10);

    const result = await deleteMenuGroup(userId, groupId);
    if (!result.ok) {
      mapGroupError(res, req, result.code);
      return;
    }

    res.json({ message: "Menu group deleted successfully" });
  } catch (error) {
    logger.error("Delete menu group error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteMenu);
  }
}
