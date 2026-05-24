import { Request, Response } from "express";
import { getPromo, upsertPromo } from "../services/promo.service";
import { logger } from "../utils/logger";

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
}

/** GET /api/promo */
export async function getPromoHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const promo = await getPromo();
    res.json({
      success: true,
      data: promo,
    });
  } catch (error) {
    logger.error("Get promo error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get promo",
    });
  }
}

/** POST /api/promo */
export async function postPromoHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (req.body.text === undefined || req.body.text === null) {
      res.status(400).json({
        success: false,
        message: "text is required",
      });
      return;
    }

    if (req.body.boolean === undefined || req.body.boolean === null) {
      res.status(400).json({
        success: false,
        message: "boolean is required",
      });
      return;
    }

    const text = String(req.body.text).trim();
    const boolean = parseBoolean(req.body.boolean);

    const promo = await upsertPromo({ text, boolean });

    res.json({
      success: true,
      message: "Promo updated successfully",
      data: promo,
    });
  } catch (error) {
    logger.error("Post promo error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update promo",
    });
  }
}
