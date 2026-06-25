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

/** Skip x-api-key validation in local dev, tests, or when explicitly enabled (e.g. devapi deploy). */
export function isApiKeyValidationSkipped(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    process.env.SKIP_API_KEY_CHECK === "true"
  );
}

/** Email verification on signup/login. Set EMAIL_VERIFICATION_ENABLED=false to disable temporarily. */
export function isEmailVerificationEnabled(): boolean {
  return process.env.EMAIL_VERIFICATION_ENABLED !== "false";
}
