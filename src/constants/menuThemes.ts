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
] as const;

export type MenuThemeId = (typeof ALLOWED_MENU_THEMES)[number];
