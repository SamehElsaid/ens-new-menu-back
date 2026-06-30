export const PLANS = {
  FREE: {
    id: 1,
    name: "Free",
    maxMenus: 1,
    maxProductsPerMenu: -1,
    hasAds: true,
    allowCustomDomain: false,
  },
  MONTHLY: {
    id: 2,
    name: "Monthly",
    maxMenus: 3,
    maxProductsPerMenu: -1,
    hasAds: false,
    allowCustomDomain: false,
  },
  YEARLY: {
    id: 3,
    name: "Yearly",
    maxMenus: 10,
    maxProductsPerMenu: -1, // unlimited
    hasAds: false,
    allowCustomDomain: true,
  },
};

/** Free plan: max bulk menu imports per user (disabled — unlimited for all). */
export const FREE_BULK_IMPORT_MAX = -1;

/** Free plan: max custom menu ads per menu. Paid plans: unlimited (-1). */
export const FREE_MAX_ADS_PER_MENU = 1;

/** Pro plan: price per extra menu per 30-day month (EGP). */
export const EXTRA_MENU_PRICE_EGP = 20;

/** Days used to prorate extra-menu purchase until subscription end (20 EGP / 30 days). */
export const EXTRA_MENU_BILLING_DAYS = 30;

export const RATE_LIMITS = {
  AUTH: {
    windowMs: 3 * 60 * 1000, // 3 minutes
    max: 5,
  },
  API: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
  PUBLIC: {
    windowMs: 15 * 60 * 1000,
    max: 200,
  },
  PASSWORD_RESET: {
    windowMs: 60 * 60 * 1000,
    max: 3,
  },
  EMAIL_VERIFICATION: {
    windowMs: 60 * 60 * 1000,
    max: 3,
  },
};

export const TOKEN_EXPIRY = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_RESET: 60 * 60 * 1000, // 1 hour
};

export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || "5242880"), // 5MB
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp"],
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".webp"],
};

export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  STAFF: "staff",
};

export const MENU_APPROVAL_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  REJECTED: "rejected",
} as const;

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
