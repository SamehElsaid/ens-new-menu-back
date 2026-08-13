/** Positions for the Google Reviews CTA on the public menu. */
export const GOOGLE_REVIEWS_POSITIONS = [
  "top",
  "bottom",
  "after_order",
] as const;

export type GoogleReviewsPosition = (typeof GOOGLE_REVIEWS_POSITIONS)[number];

export const DEFAULT_GOOGLE_REVIEWS_BUTTON_TEXT_AR = "قيّم تجربتك على Google";
export const DEFAULT_GOOGLE_REVIEWS_BUTTON_TEXT_EN =
  "Rate your experience on Google";

/** Ensures review links work as hrefs even when paste lacks a protocol. */
export function normalizeGoogleReviewsUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

function isGoogleMapsHost(host: string): boolean {
  if (host === "maps.google.com" || host.startsWith("maps.google.")) return true;
  if (host.endsWith(".maps.google.com")) return true;
  return false;
}

function isGoogleSearchHost(host: string): boolean {
  return host === "search.google.com" || host.endsWith(".search.google.com");
}

function isGoogleWebHost(host: string): boolean {
  if (host === "google.com" || host === "www.google.com") return true;
  // Regional: google.eg, www.google.co.uk, etc.
  if (/^(www\.)?google\.[a-z.]+$/i.test(host)) return true;
  return false;
}

/**
 * Accepts Google Maps / Google Reviews URLs only
 * (maps.google, google.com/maps, writereview, g.page, maps.app.goo.gl, goo.gl/maps).
 */
export function isValidGoogleReviewsUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(normalizeGoogleReviewsUrl(trimmed));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host === "maps.app.goo.gl" || host.endsWith(".maps.app.goo.gl")) {
      return true;
    }

    if (
      (host === "goo.gl" || host === "www.goo.gl") &&
      path.startsWith("/maps")
    ) {
      return true;
    }

    if (host === "g.page" || host.endsWith(".g.page")) {
      return true;
    }

    if (isGoogleMapsHost(host)) {
      return true;
    }

    if (isGoogleSearchHost(host)) {
      return (
        path.includes("/local/writereview") ||
        path.includes("/local/reviews") ||
        path.includes("/maps")
      );
    }

    if (isGoogleWebHost(host)) {
      return (
        path.includes("/maps") ||
        path.includes("/local/writereview") ||
        path.includes("/local/reviews")
      );
    }

    return false;
  } catch {
    return false;
  }
}

export function isGoogleReviewsPosition(
  value: unknown,
): value is GoogleReviewsPosition {
  return (
    typeof value === "string" &&
    (GOOGLE_REVIEWS_POSITIONS as readonly string[]).includes(value)
  );
}

/** Maps legacy `floating` (removed) to `bottom`. */
export function normalizeGoogleReviewsPosition(
  value: unknown,
): GoogleReviewsPosition {
  if (value === "floating") return "bottom";
  if (isGoogleReviewsPosition(value)) return value;
  return "bottom";
}
