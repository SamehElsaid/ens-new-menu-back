import { Request } from 'express';
import type { Locale } from '../config/constants';

/**
 * Parse Accept-Language header and resolve to supported locale ('ar' | 'en').
 * Handles values like: "ar", "en", "ar-EG", "en-US", "ar-EG,ar;q=0.9,en;q=0.8"
 * @param req - Express request (uses req.headers['accept-language'])
 * @param defaultLocale - Fallback when header is missing or no match (default 'ar')
 * @returns Resolved locale
 */
export function getLocaleFromAcceptLanguage(
  req: Request,
  defaultLocale: Locale = 'ar'
): Locale {
  const raw = req.headers['accept-language'];
  if (!raw || typeof raw !== 'string') return defaultLocale;

  const parts = raw.split(',').map((p) => {
    const [lang, q] = p.trim().split(';');
    const quality = q && q.trim().startsWith('q=') ? parseFloat(q.trim().slice(2)) : 1;
    return { lang: (lang || '').trim().toLowerCase(), quality };
  });

  parts.sort((a, b) => b.quality - a.quality);

  for (const { lang } of parts) {
    const code = lang.split('-')[0];
    if (code === 'ar') return 'ar';
    if (code === 'en') return 'en';
  }

  return defaultLocale;
}
