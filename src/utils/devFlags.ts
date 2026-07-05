/**
 * Payment test routes bypass HMAC and can mark orders completed without gateway verification.
 * Never enable in production unless explicitly overridden for a controlled environment.
 */
export function isPaymentTestRoutesEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_PAYMENT_TEST_ROUTES === "true"
  );
}

/** Swagger UI + OpenAPI spec — local development only. */
export function isSwaggerEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Skip x-api-key validation in local dev, tests, or when explicitly enabled (e.g. devapi deploy). */
export function isApiKeyValidationSkipped(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    process.env.SKIP_API_KEY_CHECK === "true"
  );
}
