import { Request, Response } from 'express';
import { getLocaleFromAcceptLanguage } from './localeHelper';
import type { Locale } from '../config/constants';

export type BilingualMessage = { en: string; ar: string };

/**
 * Pick the user-facing string for the active locale (from Accept-Language).
 */
export function pickLocalized(
  req: Request,
  messages: BilingualMessage,
  fallbackLocale: Locale = 'ar',
): string {
  const locale = getLocaleFromAcceptLanguage(req, fallbackLocale);
  return locale === 'ar' ? messages.ar : messages.en;
}

/**
 * Standard API error JSON: localized `error` plus `errorAr` / `errorEn` for clients that need both.
 */
export function sendApiError(
  res: Response,
  req: Request,
  statusCode: number,
  messages: BilingualMessage,
  extra?: Record<string, unknown>,
): void {
  const locale = getLocaleFromAcceptLanguage(req);
  const primary = locale === 'ar' ? messages.ar : messages.en;
  res.status(statusCode).json({
    error: primary,
    errorAr: messages.ar,
    errorEn: messages.en,
    ...extra,
  });
}
