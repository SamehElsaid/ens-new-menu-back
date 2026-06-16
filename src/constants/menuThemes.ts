/**
 * Allowed `Menus.theme` values — keep in sync with dashboard `templatesInfo` slugs.
 */
export const ALLOWED_MENU_THEMES = [
  "default",
  "neon",
  "coffee",
  "sky",
  "emerald",
  "noir",
  "oceanic",
  "pharaonic",
  "arcane",
  "music",
  "retro",
] as const;

export type MenuThemeId = (typeof ALLOWED_MENU_THEMES)[number];

export type ThemeCustomizationDefaults = {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
};

/** Default brand colors per template — keep in sync with dashboard `templatesInfo.defaultColors`. */
export const THEME_CUSTOMIZATION_DEFAULTS: Record<
  MenuThemeId,
  ThemeCustomizationDefaults
> = {
  default: {
    primaryColor: "#0ea5e9",
    secondaryColor: "#6366f1",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  neon: {
    primaryColor: "#14b8a6",
    secondaryColor: "#06b6d4",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  coffee: {
    primaryColor: "#f97316",
    secondaryColor: "#facc15",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  sky: {
    primaryColor: "#3b82f6",
    secondaryColor: "#2563eb",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  emerald: {
    primaryColor: "#4c1121",
    secondaryColor: "#9b2545",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  noir: {
    primaryColor: "#7c3aed",
    secondaryColor: "#06b6d4",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  oceanic: {
    primaryColor: "#0ea5e9",
    secondaryColor: "#0891b2",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  pharaonic: {
    primaryColor: "#C9A227",
    secondaryColor: "#0E7C86",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  arcane: {
    primaryColor: "#D1282A",
    secondaryColor: "#991B1B",
    backgroundColor: "#ffffff",
    textColor: "#111111",
  },
  music: {
    primaryColor: "#4338CA",
    secondaryColor: "#06B6D4",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  retro: {
    primaryColor: "#C67115",
    secondaryColor: "#84623E",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
};

const FALLBACK_CUSTOMIZATION_DEFAULTS = THEME_CUSTOMIZATION_DEFAULTS.neon;

export function getThemeCustomizationDefaults(
  theme?: string | null,
): ThemeCustomizationDefaults {
  if (
    theme &&
    Object.prototype.hasOwnProperty.call(THEME_CUSTOMIZATION_DEFAULTS, theme)
  ) {
    return THEME_CUSTOMIZATION_DEFAULTS[theme as MenuThemeId];
  }
  return FALLBACK_CUSTOMIZATION_DEFAULTS;
}

const DEFAULT_HERO_COPY = {
  heroTitleAr: "استكشف قائمتنا",
  heroSubtitleAr: "اختر من مجموعة متنوعة من الأطباق اللذيذة",
  heroTitleEn: "Explore Our Menu",
  heroSubtitleEn: "Choose from a variety of delicious dishes",
} as const;

export function buildDefaultCustomizationPayload(
  menuId: number,
  theme?: string | null,
) {
  return {
    menuId,
    ...getThemeCustomizationDefaults(theme),
    ...DEFAULT_HERO_COPY,
  };
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function customizationIncludesHeroTextFields(body: {
  heroTitleAr?: unknown;
  heroSubtitleAr?: unknown;
  heroTitleEn?: unknown;
  heroSubtitleEn?: unknown;
}): boolean {
  return (
    hasNonEmptyString(body.heroTitleAr) ||
    hasNonEmptyString(body.heroSubtitleAr) ||
    hasNonEmptyString(body.heroTitleEn) ||
    hasNonEmptyString(body.heroSubtitleEn)
  );
}
