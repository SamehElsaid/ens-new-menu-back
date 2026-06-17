import { Request, Response, NextFunction } from "express";
import { decryptDataApi } from "../utils/decrypt";
import { logger } from "../utils/logger";
import { pickLocalized, sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { isPaymentTestRoutesEnabled } from "../utils/devFlags";

require("dotenv").config();

/**
 * List of public routes that don't require API key
 */
const publicRoutes = [
  "/health",
  "/api/verifykit",
  "/api/public",
  "/api/public/app-version",
  "/api/public/app-version/latest",
  "/api/public/version",
  "/api/public/version/latest",
  // EasyKash return URL + webhook (secured by gateway ref / HMAC, not x-api-key)
  "/api/payment/redirect",
  "/api/payment/easykash/callback",
  ...(isPaymentTestRoutesEnabled()
    ? ["/api/payment/easykash/callback/test", "/api/payment/test"]
    : []),
];

/**
 * Check if the current route is a public route (no x-api-key required)
 */
function normalizePath(value: string): string {
  const pathOnly = value.split("?")[0];
  if (!pathOnly) return "";
  return pathOnly.length > 1 && pathOnly.endsWith("/")
    ? pathOnly.slice(0, -1)
    : pathOnly;
}

function isPublicRoute(req: Request): boolean {
  const candidates = [
    req.originalUrl,
    req.url,
    req.baseUrl && req.path ? `${req.baseUrl}${req.path}` : "",
    req.path,
  ]
    .map((v) => normalizePath(String(v ?? "")))
    .filter(Boolean);

  return candidates.some((path) =>
    publicRoutes.some(
      (route) => path === route || path.startsWith(route + "/"),
    ),
  );
}

/**
 * Middleware to decrypt x-api-key header if present
 * Decrypts the API key using ENCRYPTION_KEY from environment variables
 * Logs the decrypted data for debugging
 * Skips validation for public routes (health, payment webhooks, etc.)
 */
/** Paths that must never require x-api-key (mobile, public menus, health). */
function isFullyOpenPath(req: Request): boolean {
  const paths = [req.originalUrl, req.url, req.path]
    .map((v) => normalizePath(String(v ?? "")))
    .filter(Boolean);

  return paths.some((p) => p === "/health" || p.startsWith("/api/public"));
}

export function decryptApiKey(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "development") {
    return next();
  }

  // Always allow public API + health (works even if route order differs on deploy)
  if (isFullyOpenPath(req) || isPublicRoute(req)) {
    return next();
  }

  const apiKey = req.headers["x-api-key"] as string | undefined;

  // Require x-api-key header
  if (!apiKey) {
    logger.error("❌ Missing x-api-key header:", {
      path: req.path,
      method: req.method,
    });
    return sendApiError(res, req, 401, ApiErrors.noToken);
  }

  // If x-api-key is present, decrypt it
  if (apiKey) {
    const encryptionKey = process.env.ENCRYPTION_KEY;

    // console.log("encryptionKey", encryptionKey);

    if (!encryptionKey) {
      logger.warn("x-api-key header present but ENCRYPTION_KEY not configured");
      return next();
    }

    try {
      const decryptedData = decryptDataApi(apiKey, encryptionKey);
      const match = decryptedData.match(/\/\/\/([\d.]+)/);

      if (!match) {
        logger.error("❌ Invalid token format:", {
          path: req.path,
          method: req.method,
        });
        return sendApiError(res, req, 401, ApiErrors.invalidTokenFormat);
      }

      const sentTimestamp = parseFloat(match[1]);
      const currentTimestamp = Date.now() / 1000;

      if (Math.abs(currentTimestamp - sentTimestamp) > 60) {
        logger.error("❌ Token expired:", {
          path: req.path,
          method: req.method,
          timeDifference: Math.abs(currentTimestamp - sentTimestamp),
        });
        return sendApiError(res, req, 405, ApiErrors.tokenExpired);
      }
      // console.log(apiKey, "decryptedData", encryptionKey);

      // Attach decrypted data to request object for potential use in controllers
      (req as any).decryptedApiKey = decryptedData;
    } catch (error) {
      logger.error("❌ Failed to decrypt x-api-key:", {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        method: req.method,
      });
      const tech = error instanceof Error ? error.message : String(error);
      const en = `${ApiErrors.apiKeyDecryptFailed.en}: ${tech}`;
      const ar = `${ApiErrors.apiKeyDecryptFailed.ar}: ${tech}`;
      return res.status(401).json({
        error: pickLocalized(req, { en, ar }),
        errorAr: ar,
        errorEn: en,
      });
    }
  }

  next();
}
