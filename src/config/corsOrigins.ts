import { logger } from "../utils/logger";

/** Dev API (devapi.ensbot.net) + local — not production ensapi / *.ensmenu.com frontends. */
function isDevCorsDeployment(): boolean {
  if (process.env.CORS_ALLOW_VERCEL === "true") return true;
  if (process.env.NODE_ENV !== "production") return true;
  const apiUrl = process.env.API_URL?.trim().toLowerCase() ?? "";
  return apiUrl.includes("devapi.ensbot.net");
}

function isVercelPreviewOrigin(url: URL): boolean {
  return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
}

/** Comma-separated full origin strings, e.g. `https://app.example.com,capacitor://localhost` */
function parseExtraOrigins(): Set<string> {
  const raw = process.env.CORS_EXTRA_ORIGINS?.trim();
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * Capacitor / Ionic WebViews and Metro often send localhost-style origins even in production builds.
 * Browsers never spoof Origin, so allowing these is standard for hybrid mobile + local dev.
 */
function isLocalOrHybridWebViewOrigin(url: URL): boolean {
  const { protocol, hostname } = url;
  const localHost =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1";
  if (!localHost) return false;
  return (
    protocol === "http:" ||
    protocol === "https:" ||
    protocol === "capacitor:" ||
    protocol === "ionic:"
  );
}

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

  if (parseExtraOrigins().has(origin)) {
    callback(null, true);
    return;
  }

  try {
    const url = new URL(origin);
    const isEnsmenuOrigin =
      url.hostname === "ensmenu.com" ||
      url.hostname.endsWith(".ensmenu.com") ||
      url.hostname === "ensmenu.ens.eg" ||
      url.hostname.endsWith(".ensmenu.ens.eg");

    if (isEnsmenuOrigin) {
      callback(null, true);
      return;
    }

    // Vercel previews (e.g. ens-menu-dev.vercel.app) — dev API only
    if (isDevCorsDeployment() && isVercelPreviewOrigin(url)) {
      callback(null, true);
      return;
    }
    if (isLocalOrHybridWebViewOrigin(url)) {
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
    `CORS rejected: origin not allowed — origin=${JSON.stringify(origin)} (production: *.ensmenu.com; dev API: *.vercel.app + localhost; or set CORS_EXTRA_ORIGINS)`
  );
  callback(null, false);
}
