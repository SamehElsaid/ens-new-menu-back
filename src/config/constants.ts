export const PLANS = {
  FREE: {
    id: 1,
    name: 'Free',
    maxMenus: 1,
    maxProductsPerMenu: 20,
    hasAds: true,
    allowCustomDomain: false,
  },
  MONTHLY: {
    id: 2,
    name: 'Monthly',
    maxMenus: 3,
    maxProductsPerMenu: 100,
    hasAds: false,
    allowCustomDomain: false,
  },
  YEARLY: {
    id: 3,
    name: 'Yearly',
    maxMenus: 10,
    maxProductsPerMenu: -1, // unlimited
    hasAds: false,
    allowCustomDomain: true,
  },
};

export const RATE_LIMITS = {
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
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
  UPLOAD: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
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
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
};

export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
};

export const LOCALES = ['ar', 'en'] as const;
export type Locale = typeof LOCALES[number];


