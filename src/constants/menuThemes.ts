/**
 * Allowed `Menus.theme` values — keep in sync with dashboard `templatesInfo` slugs.
 */
export const ALLOWED_MENU_THEMES = [
  "default",
  "neon",
  "coffee",
  "sky",
  "onecard",
  "waffle",
  "vanilla",
] as const;

/** Retired templates — migrated to `default` on startup. */
export const DEPRECATED_MENU_THEMES = [
  "emerald",
  "noir",
  "oceanic",
  "pharaonic",
  "arcane",
  "music",
  "retro",
] as const;

export type MenuThemeId = (typeof ALLOWED_MENU_THEMES)[number];

const ALLOWED_THEME_SET = new Set<string>(ALLOWED_MENU_THEMES);

export function normalizeMenuTheme(theme?: string | null): MenuThemeId {
  if (theme && ALLOWED_THEME_SET.has(theme)) {
    return theme as MenuThemeId;
  }
  return "default";
}

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
    primaryColor: "#9333EA",
    secondaryColor: "#7C3AED",
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
  onecard: {
    primaryColor: "#7B2CBF",
    secondaryColor: "#5A189A",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  waffle: {
    primaryColor: "#7B2CBF",
    secondaryColor: "#5A189A",
    backgroundColor: "#240046",
    textColor: "#ffffff",
  },
  vanilla: {
    primaryColor: "#7B2CBF",
    secondaryColor: "#5A189A",
    backgroundColor: "#efe6f8",
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
