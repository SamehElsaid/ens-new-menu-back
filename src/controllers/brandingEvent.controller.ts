import { Request, Response } from "express";
import {
  recordBrandingEvent,
  type BrandingEventType,
} from "../services/brandingEvent.service";

export async function postMenuBrandingEvent(
  req: Request,
  res: Response,
): Promise<void> {
  const slug = decodeURIComponent(String(req.params.slug ?? "")).trim();
  const type = String(req.body?.type ?? "").toLowerCase();

  if (!slug || (type !== "impression" && type !== "click")) {
    res.status(400).json({ ok: false });
    return;
  }

  try {
    const recorded = await recordBrandingEvent(
      slug,
      type as BrandingEventType,
    );
    res.status(recorded ? 204 : 404).send();
  } catch {
    res.status(204).send();
  }
}
