import { Request, Response } from "express";
import {
  deleteSearchInformation,
  getSearchInformation,
  upsertSearchInformation,
} from "../services/searchInformation.service";
import { logger } from "../utils/logger";

function requireStringField(
  res: Response,
  value: unknown,
  field: string,
): value is string {
  if (value === undefined || value === null) {
    res.status(400).json({
      success: false,
      message: `${field} is required`,
    });
    return false;
  }
  return true;
}

/** GET /api/searchInformation */
export async function getSearchInformationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const data = await getSearchInformation();
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Get searchInformation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get search information",
    });
  }
}

/** POST /api/searchInformation */
export async function postSearchInformationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const fields = [
      "titleAr",
      "titleEn",
      "descriptionAr",
      "descriptionEn",
    ] as const;

    for (const field of fields) {
      if (!requireStringField(res, req.body[field], field)) {
        return;
      }
    }

    const data = await upsertSearchInformation({
      titleAr: String(req.body.titleAr).trim(),
      titleEn: String(req.body.titleEn).trim(),
      descriptionAr: String(req.body.descriptionAr).trim(),
      descriptionEn: String(req.body.descriptionEn).trim(),
    });

    res.json({
      success: true,
      message: "Search information saved successfully",
      data,
    });
  } catch (error) {
    logger.error("Post searchInformation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save search information",
    });
  }
}

/** DELETE /api/searchInformation */
export async function deleteSearchInformationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const data = await deleteSearchInformation();
    res.json({
      success: true,
      message: "Search information cleared successfully",
      data,
    });
  } catch (error) {
    logger.error("Delete searchInformation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete search information",
    });
  }
}
