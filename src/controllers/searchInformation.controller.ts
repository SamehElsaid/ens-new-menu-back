import { Request, Response } from "express";
import {
  getAllSearchInformation,
  getSearchInformationById,
  createSearchInformation,
  updateSearchInformation,
  deleteSearchInformationById,
} from "../services/searchInformation.service";
import { logger } from "../utils/logger";

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ""), 10);
  return isNaN(n) || n < 1 ? fallback : n;
}

function requireStringField(
  res: Response,
  value: unknown,
  field: string,
): value is string {
  if (value === undefined || value === null) {
    res.status(400).json({ success: false, message: `${field} is required` });
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
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, parsePositiveInt(req.query.limit, 10));
    const search = req.query.search ? String(req.query.search).trim() : undefined;

    const result = await getAllSearchInformation(page, limit, search);

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error("Get searchInformation error:", error);
    res.status(500).json({ success: false, message: "Failed to get search information" });
  }
}

/** GET /api/searchInformation/:id */
export async function getSearchInformationByIdHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    const data = await getSearchInformationById(id);
    if (!data) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    logger.error("Get searchInformation by id error:", error);
    res.status(500).json({ success: false, message: "Failed to get search information" });
  }
}

/** POST /api/searchInformation */
export async function postSearchInformationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const fields = ["titleAr", "titleEn", "descriptionAr", "descriptionEn"] as const;

    for (const field of fields) {
      if (!requireStringField(res, req.body[field], field)) return;
    }

    const data = await createSearchInformation({
      titleAr: String(req.body.titleAr).trim(),
      titleEn: String(req.body.titleEn).trim(),
      descriptionAr: String(req.body.descriptionAr).trim(),
      descriptionEn: String(req.body.descriptionEn).trim(),
    });

    res.status(201).json({ success: true, message: "Search information created successfully", data });
  } catch (error) {
    logger.error("Post searchInformation error:", error);
    res.status(500).json({ success: false, message: "Failed to create search information" });
  }
}

/** PUT /api/searchInformation/:id */
export async function putSearchInformationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    const fields = ["titleAr", "titleEn", "descriptionAr", "descriptionEn"] as const;

    for (const field of fields) {
      if (!requireStringField(res, req.body[field], field)) return;
    }

    const data = await updateSearchInformation(id, {
      titleAr: String(req.body.titleAr).trim(),
      titleEn: String(req.body.titleEn).trim(),
      descriptionAr: String(req.body.descriptionAr).trim(),
      descriptionEn: String(req.body.descriptionEn).trim(),
    });

    if (!data) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }

    res.json({ success: true, message: "Search information updated successfully", data });
  } catch (error) {
    logger.error("Put searchInformation error:", error);
    res.status(500).json({ success: false, message: "Failed to update search information" });
  }
}

/** DELETE /api/searchInformation/:id */
export async function deleteSearchInformationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    const deleted = await deleteSearchInformationById(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }

    res.json({ success: true, message: "Search information deleted successfully" });
  } catch (error) {
    logger.error("Delete searchInformation error:", error);
    res.status(500).json({ success: false, message: "Failed to delete search information" });
  }
}
