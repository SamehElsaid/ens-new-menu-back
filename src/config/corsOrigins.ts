import { logger } from "../utils/logger";

/**
 * Shared origin check for Express CORS and Socket.IO.
 */
export function corsOriginDelegate(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (process.env.NODE_ENV === "development") {
    try {
      const url = new URL(origin);
      if (
        url.hostname === "localhost" ||
        url.hostname.endsWith(".localhost") ||
        url.hostname === "127.0.0.1"
      ) {
        callback(null, true);
        return;
      }
    } catch {
      callback(null, false);
      return;
    }
  }

  try {
    const url = new URL(origin);
    if (
      url.hostname === "ensmenu.com" ||
      url.hostname.endsWith(".ensmenu.com") ||
      url.hostname === "ensmenu.ens.eg" ||
      url.hostname.endsWith(".ensmenu.ens.eg")
    ) {
      callback(null, true);
      return;
    }
  } catch {
    logger.warn("Invalid CORS origin:", origin);
    callback(null, false);
    return;
  }

  logger.warn(`🔴 CORS blocked: ${origin}`);
  callback(null, false);
}
