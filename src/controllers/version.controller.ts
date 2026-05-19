import { Request, Response } from "express";
import {
  createAppVersion,
  getLatestAppVersion,
} from "../services/version.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logger } from "../utils/logger";
import { getImageUrl } from "../utils/urlHelper";

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return false;
}

function versionPayload(version: {
  latestVersion: string;
  forceUpdate: boolean;
  downloadUrl: string;
  releaseNotes_ar: string | null;
  releaseNotes_en: string | null;
  updatedAt?: string;
}) {
  return {
    latestVersion: version.latestVersion,
    forceUpdate: version.forceUpdate,
    downloadUrl: getImageUrl(version.downloadUrl) ?? version.downloadUrl,
    releaseNotes_ar: version.releaseNotes_ar,
    releaseNotes_en: version.releaseNotes_en,
    updatedAt: version.updatedAt,
  };
}

/** GET /api/public/version/latest — returns the most recently added version record */
export async function getLatestVersion(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const version = await getLatestAppVersion();
    if (!version) {
      sendApiError(res, req, 404, ApiErrors.versionNotFound);
      return;
    }

    res.json({
      success: true,
      data: versionPayload(version),
    });
  } catch (error) {
    logger.error("Get latest app version error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetVersion);
  }
}

/** POST /api/public/version — returns latest app version config */
export async function postAppVersion(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const version = await getLatestAppVersion();
    if (!version) {
      sendApiError(res, req, 404, ApiErrors.versionNotFound);
      return;
    }

    res.json({
      success: true,
      data: versionPayload(version),
    });
  } catch (error) {
    logger.error("Post app version error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetVersion);
  }
}

/** GET /api/admin/app-version — latest version */
export async function getAdminAppVersion(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const version = await getLatestAppVersion();
    if (!version) {
      sendApiError(res, req, 404, ApiErrors.versionNotFound);
      return;
    }

    res.json({ version: versionPayload(version) });
  } catch (error) {
    logger.error("Admin get app version error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetVersion);
  }
}

/** POST /api/admin/app-version — add a new version record */
export async function createAdminAppVersion(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const latestVersion = String(req.body.latestVersion ?? "").trim();
    if (!latestVersion) {
      sendApiError(res, req, 400, ApiErrors.versionNumberRequired);
      return;
    }

    const forceUpdate = parseBoolean(req.body.forceUpdate);
    const releaseNotes_ar =
      req.body.releaseNotes_ar != null
        ? String(req.body.releaseNotes_ar).trim() || null
        : null;
    const releaseNotes_en =
      req.body.releaseNotes_en != null
        ? String(req.body.releaseNotes_en).trim() || null
        : null;

    const downloadUrl = String(req.body.downloadUrl ?? "").trim();
    if (!downloadUrl) {
      sendApiError(res, req, 400, ApiErrors.downloadUrlRequired);
      return;
    }

    const created = await createAppVersion({
      latestVersion,
      forceUpdate,
      downloadUrl,
      releaseNotes_ar,
      releaseNotes_en,
    });

    res.status(201).json({
      message: "App version created successfully",
      version: versionPayload(created),
    });
  } catch (error) {
    logger.error("Admin create app version error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateVersion);
  }
}
