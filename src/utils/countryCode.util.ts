const CURRENCY_TO_COUNTRY_CODE: Record<string, string> = {
  AED: "AE",
  SAR: "SA",
  EGP: "EG",
  USD: "US",
  EUR: "EU",
  GBP: "GB",
  KWD: "KW",
  QAR: "QA",
  BHD: "BH",
  OMR: "OM",
  JOD: "JO",
  LBP: "LB",
  MAD: "MA",
  TND: "TN",
  IQD: "IQ",
  TRY: "TR",
  INR: "IN",
  PKR: "PK",
  LYD: "LY",
  DZD: "DZ",
  SDG: "SD",
  YER: "YE",
  ILS: "IL",
};

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  egypt: "EG",
  مصر: "EG",
  "saudi arabia": "SA",
  السعودية: "SA",
  "المملكة العربية السعودية": "SA",
  uae: "AE",
  "united arab emirates": "AE",
  الإمارات: "AE",
  "الإمارات العربية المتحدة": "AE",
  kuwait: "KW",
  الكويت: "KW",
  libya: "LY",
  ليبيا: "LY",
  turkey: "TR",
  تركيا: "TR",
  iraq: "IQ",
  العراق: "IQ",
  palestine: "PS",
  فلسطين: "PS",
  jordan: "JO",
  الأردن: "JO",
  lebanon: "LB",
  لبنان: "LB",
  syria: "SY",
  سوريا: "SY",
  qatar: "QA",
  قطر: "QA",
  bahrain: "BH",
  البحرين: "BH",
  oman: "OM",
  عمان: "OM",
  morocco: "MA",
  المغرب: "MA",
  tunisia: "TN",
  تونس: "TN",
  algeria: "DZ",
  الجزائر: "DZ",
  sudan: "SD",
  السودان: "SD",
  yemen: "YE",
  اليمن: "YE",
};

export function resolveCountryCodeFromCurrency(
  currency: string | null | undefined,
): string | null {
  if (!currency?.trim()) return null;
  return CURRENCY_TO_COUNTRY_CODE[currency.trim().toUpperCase()] ?? null;
}

export function resolveFeaturedLogoCountryCode(options: {
  currency?: string | null;
  country?: string | null;
}): string | null {
  return (
    resolveCountryCodeFromCurrency(options.currency) ??
    resolveCountryCode(options.country)
  );
}

export function resolveCountryCode(country: string | null | undefined): string | null {
  if (!country?.trim()) return null;
  const normalized = country.trim().toLowerCase();
  const direct = COUNTRY_NAME_TO_CODE[normalized];
  if (direct) return direct;

  const trimmedOriginal = country.trim();
  const originalMatch = COUNTRY_NAME_TO_CODE[trimmedOriginal];
  if (originalMatch) return originalMatch;

  if (/^[A-Za-z]{2}$/.test(trimmedOriginal)) {
    return trimmedOriginal.toUpperCase();
  }

  return null;
}
