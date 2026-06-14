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
