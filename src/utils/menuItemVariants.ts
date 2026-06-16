import {
  attachParsedSizes,
  type MenuItemSize,
} from "./menuItemSizes";

export type MenuItemVariant = {
  labelAr: string;
  labelEn: string;
  price: number;
};

type RawVariant = {
  labelAr?: unknown;
  labelEn?: unknown;
  label_ar?: unknown;
  label_en?: unknown;
  label?: unknown;
  nameAr?: unknown;
  nameEn?: unknown;
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

export function normalizeMenuItemVariantsInput(
  raw: unknown,
): MenuItemVariant[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];

  const variants: MenuItemVariant[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const node = entry as RawVariant;

    const labelAr =
      pickString(node.labelAr) ||
      pickString(node.label_ar) ||
      pickString(node.nameAr) ||
      pickString(node.label);
    const labelEn =
      pickString(node.labelEn) ||
      pickString(node.label_en) ||
      pickString(node.nameEn) ||
      pickString(node.label);
    const price = pickPrice(node.price);

    if (!labelAr || !labelEn || price === null) continue;

    variants.push({ labelAr, labelEn, price });
  }

  return variants;
}

export function validateMenuItemVariants(
  variants: MenuItemVariant[] | null,
): string | null {
  if (!variants || variants.length === 0) return null;

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (!variant.labelAr.trim()) {
      return `Variant at index ${i} must have labelAr`;
    }
    if (!variant.labelEn.trim()) {
      return `Variant at index ${i} must have labelEn`;
    }
    if (!Number.isFinite(variant.price) || variant.price < 0) {
      return `Variant at index ${i} must have a valid price`;
    }
  }

  return null;
}

export function serializeMenuItemVariants(
  variants: MenuItemVariant[] | null | undefined,
): string | null {
  if (!variants || variants.length === 0) return null;
  return JSON.stringify(variants);
}

export function parseMenuItemVariants(raw: unknown): MenuItemVariant[] | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (Array.isArray(raw)) {
    const variants = normalizeMenuItemVariantsInput(raw);
    return variants && variants.length > 0 ? variants : null;
  }

  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const variants = normalizeMenuItemVariantsInput(parsed);
    return variants && variants.length > 0 ? variants : null;
  } catch {
    return null;
  }
}

export function attachParsedVariants<T extends Record<string, unknown>>(
  row: T,
): T & { variants: MenuItemVariant[] | null } {
  return {
    ...row,
    variants: parseMenuItemVariants(row.variants),
  };
}

export function attachParsedMenuItemOptionsList<T extends Record<string, unknown>>(
  rows: T[],
): Array<T & { sizes: MenuItemSize[] | null; variants: MenuItemVariant[] | null }> {
  return rows.map((row) => attachParsedVariants(attachParsedSizes(row)));
}
