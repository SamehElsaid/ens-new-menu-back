/**
 * URL Helper Utilities
 * Provides dynamic URL generation for images and assets
 */

/**
 * Get the base URL for the API/Backend
 * Uses environment variable or falls back to localhost
 */
export function getBaseUrl(): string {
  return process.env.API_URL || "http://localhost:5000";
}

/**
 * Convert relative image path to absolute URL
 * @param relativePath - Path like '/uploads/menu-items/image.webp'
 * @returns Full URL like 'http://localhost:5000/uploads/menu-items/image.webp'
 */
export function getImageUrl(
  relativePath: string | null | undefined
): string | null {
  if (!relativePath) return null;

  // If already absolute URL, return as is
  if (
    relativePath.startsWith("http://") ||
    relativePath.startsWith("https://")
  ) {
    return relativePath;
  }

  // Convert relative to absolute
  const baseUrl = getBaseUrl();
  return `${baseUrl}${relativePath.startsWith("/") ? "" : "/"}${relativePath}`;
}

/**
 * Convert absolute URL to relative path (for database storage)
 * @param absoluteUrl - Full URL like 'http://localhost:5000/uploads/image.webp'
 * @returns Relative path like '/uploads/image.webp'
 */
export function getRelativePath(
  absoluteUrl: string | null | undefined
): string | null {
  if (!absoluteUrl) return null;

  // If already relative, return as is
  if (
    !absoluteUrl.startsWith("http://") &&
    !absoluteUrl.startsWith("https://")
  ) {
    return absoluteUrl;
  }

  // Extract path from URL
  try {
    const url = new URL(absoluteUrl);
    return url.pathname;
  } catch {
    return absoluteUrl;
  }
}

/**
 * Ensure image URLs are absolute for API responses
 * @param items - Array of items with image property
 * @returns Items with absolute image URLs
 */
export function normalizeImageUrls<T extends { image?: string | null }>(
  items: T[]
): T[] {
  return items.map((item) => ({
    ...item,
    image: getImageUrl(item.image),
  }));
}

/**
 * Normalize a single item's image URL
 */
export function normalizeImageUrl<T extends { image?: string | null }>(
  item: T
): T {
  return {
    ...item,
    image: getImageUrl(item.image),
  };
}
