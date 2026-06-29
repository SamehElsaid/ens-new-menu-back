import { Request, Response } from "express";
import {
  getAllMetaData,
  getMetaDataByPageName,
  createMetaData,
  patchMetaData,
  updateMetaData,
  deleteMetaDataByPageName,
} from "../services/metaData.service";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

const META_DATA_FIELDS = [
  "titleAr",
  "titleEn",
  "descriptionAr",
  "descriptionEn",
  "keywordsAr",
  "keywordsEn",
] as const;

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

function handleApiError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      messageAr: error.messageAr,
    });
    return;
  }

  logger.error(fallbackMessage, error);
  res.status(500).json({ success: false, message: fallbackMessage });
}

function parsePageNameParam(res: Response, raw: unknown): string | null {
  const pageName = String(raw ?? "").trim();
  if (!pageName) {
    res.status(400).json({ success: false, message: "pageName is required" });
    return null;
  }
  return pageName;
}

function parseContentFields(
  res: Response,
  body: Record<string, unknown>,
): Record<(typeof META_DATA_FIELDS)[number], string> | null {
  const result = {} as Record<(typeof META_DATA_FIELDS)[number], string>;

  for (const field of META_DATA_FIELDS) {
    if (!requireStringField(res, body[field], field)) return null;
    result[field] = String(body[field]).trim();
  }

  return result;
}

/** GET /api/metaData */
export async function getMetaDataHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, parsePositiveInt(req.query.limit, 10));

    const result = await getAllMetaData(page, limit);

    res.json({ success: true, ...result });
  } catch (error) {
    handleApiError(res, error, "Failed to get meta data");
  }
}

/** GET /api/metaData/:pageName */
export async function getMetaDataByPageNameHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const pageName = parsePageNameParam(res, req.params.pageName);
    if (!pageName) return;

    const data = await getMetaDataByPageName(pageName);
    if (!data) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    handleApiError(res, error, "Failed to get meta data");
  }
}

/** POST /api/metaData */
export async function postMetaDataHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!requireStringField(res, req.body.pageName, "pageName")) return;

    const fields = parseContentFields(res, req.body);
    if (!fields) return;

    const data = await createMetaData({
      pageName: String(req.body.pageName).trim(),
      ...fields,
    });

    res
      .status(201)
      .json({ success: true, message: "Meta data created successfully", data });
  } catch (error) {
    handleApiError(res, error, "Failed to create meta data");
  }
}

/** PUT /api/metaData/:pageName */
export async function putMetaDataHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const pageName = parsePageNameParam(res, req.params.pageName);
    if (!pageName) return;

    const fields = parseContentFields(res, req.body);
    if (!fields) return;

    const data = await updateMetaData(pageName, fields);

    if (!data) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }

    res.json({
      success: true,
      message: "Meta data updated successfully",
      data,
    });
  } catch (error) {
    handleApiError(res, error, "Failed to update meta data");
  }
}

/** PATCH /api/metaData/:pageName */
export async function patchMetaDataHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const pageName = parsePageNameParam(res, req.params.pageName);
    if (!pageName) return;

    const updates: Record<string, string> = {};
    for (const field of META_DATA_FIELDS) {
      if (req.body[field] !== undefined) {
        if (!requireStringField(res, req.body[field], field)) return;
        updates[field] = String(req.body[field]).trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ success: false, message: "No fields to update" });
      return;
    }

    const data = await patchMetaData(pageName, updates);

    if (!data) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }

    res.json({
      success: true,
      message: "Meta data updated successfully",
      data,
    });
  } catch (error) {
    handleApiError(res, error, "Failed to update meta data");
  }
}

/** DELETE /api/metaData/:pageName */
export async function deleteMetaDataHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const pageName = parsePageNameParam(res, req.params.pageName);
    if (!pageName) return;

    const deleted = await deleteMetaDataByPageName(pageName);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }

    res.json({ success: true, message: "Meta data deleted successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to delete meta data");
  }
}
