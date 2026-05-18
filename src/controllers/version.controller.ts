import { Request, Response } from "express";
import { getAppVersion, getLatestAppVersion } from "../services/version.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logger } from "../utils/logger";

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
      data: {
        latestVersion: version.latestVersion,
        forceUpdate: version.forceUpdate,
        downloadUrl: version.downloadUrl,
        releaseNotes_ar: version.releaseNotes_ar,
        releaseNotes_en: version.releaseNotes_en,
        updatedAt: version.updatedAt,
      },
    });
  } catch (error) {
    logger.error("Get latest app version error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetVersion);
  }
}

/** POST /api/public/version — returns current app version config */
export async function postAppVersion(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const version = await getAppVersion();
    if (!version) {
      sendApiError(res, req, 404, ApiErrors.versionNotFound);
      return;
    }

    res.json({
      success: true,
      data: {
        latestVersion: version.latestVersion,
        forceUpdate: version.forceUpdate,
        downloadUrl: version.downloadUrl,
        releaseNotes_ar: version.releaseNotes_ar,
        releaseNotes_en: version.releaseNotes_en,
      },
    });
  } catch (error) {
    logger.error("Post app version error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetVersion);
  }
}
