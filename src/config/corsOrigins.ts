import { logger } from "../utils/logger";

/**
 * Shared origin check for Express CORS and Socket.IO.
 */
export function corsOriginDelegate(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
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
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn(
        `CORS rejected: invalid origin URL (development) — origin=${JSON.stringify(origin)} — ${detail}`
      );
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
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.warn(
      `CORS rejected: invalid origin URL — origin=${JSON.stringify(origin)} — ${detail}`
    );
    callback(null, false);
    return;
  }

  logger.warn(
    `CORS rejected: origin not allowed — origin=${JSON.stringify(origin)} (use CORS_EXTRA_ORIGINS or an *.ensmenu.com / *.ensmenu.ens.eg host)`
  );
  callback(null, false);
}
