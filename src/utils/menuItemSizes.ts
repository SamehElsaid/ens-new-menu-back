export type MenuItemSize = {
  nameAr: string;
  nameEn: string;
  price: number;
};

type RawSize = {
  nameAr?: unknown;
  nameEn?: unknown;
  name_ar?: unknown;
  name_en?: unknown;
  labelAr?: unknown;
  labelEn?: unknown;
  label?: unknown;
  price?: unknown;
};

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function normalizeMenuItemSizesInput(
  raw: unknown,
): MenuItemSize[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];

  const sizes: MenuItemSize[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const node = entry as RawSize;

    const nameAr =
      pickString(node.nameAr) ||
      pickString(node.name_ar) ||
      pickString(node.labelAr) ||
      pickString(node.label);
    const nameEn =
      pickString(node.nameEn) ||
      pickString(node.name_en) ||
      pickString(node.labelEn) ||
      pickString(node.label);
    const price = pickPrice(node.price);

    if (!nameAr || !nameEn || price === null) continue;

    sizes.push({ nameAr, nameEn, price });
  }

  return sizes;
}

export function validateMenuItemSizes(
  sizes: MenuItemSize[] | null,
): string | null {
  if (!sizes || sizes.length === 0) return null;

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    if (!size.nameAr.trim()) {
      return `Size at index ${i} must have nameAr`;
    }
    if (!size.nameEn.trim()) {
      return `Size at index ${i} must have nameEn`;
    }
    if (!Number.isFinite(size.price) || size.price < 0) {
      return `Size at index ${i} must have a valid price`;
    }
  }

  return null;
}

export function serializeMenuItemSizes(
  sizes: MenuItemSize[] | null | undefined,
): string | null {
  if (!sizes || sizes.length === 0) return null;
  return JSON.stringify(sizes);
}

export function parseMenuItemSizes(raw: unknown): MenuItemSize[] | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (Array.isArray(raw)) {
    return normalizeMenuItemSizesInput(raw);
  }

  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const sizes = normalizeMenuItemSizesInput(parsed);
    return sizes && sizes.length > 0 ? sizes : null;
  } catch {
    return null;
  }
}

export function resolveMenuItemBasePrice(
  price: unknown,
  sizes: MenuItemSize[] | null,
): number | null {
  if (sizes && sizes.length > 0) {
    return Math.min(...sizes.map((size) => size.price));
  }

  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function attachParsedSizes<T extends Record<string, unknown>>(
  row: T,
): T & { sizes: MenuItemSize[] | null } {
  const sizes = parseMenuItemSizes(row.sizes);
  return {
    ...row,
    sizes,
  };
}

export function attachParsedSizesList<T extends Record<string, unknown>>(
  rows: T[],
): Array<T & { sizes: MenuItemSize[] | null }> {
  return rows.map((row) => attachParsedSizes(row));
}
