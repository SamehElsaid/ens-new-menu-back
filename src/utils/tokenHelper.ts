import jwt from "jsonwebtoken";
import crypto from "crypto";

export interface TokenPayload {
  id: number;
  userId: number;
  email: string;
  role: string;
  /** When `role` is `staff`: typically `waiter` (see `staffJobRoles`). */
  staffJobRole?: string;
  /** For linked dashboard roles (e.g. cashier): owning restaurant user id (subscription + ownership). */
  ownerUserId?: number;
}

// Validate JWT secrets on startup
export function validateJWTSecrets(): void {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!accessSecret || !refreshSecret) {
    throw new Error(
      "🔴 SECURITY ERROR: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in environment variables!"
    );
  }

  // Check minimum length (256 bits = 64 hex characters)
  const minLength = 32; // 256 bits / 8 = 32 bytes minimum

  if (accessSecret.length < minLength) {
    throw new Error(
      `🔴 SECURITY ERROR: JWT_ACCESS_SECRET is too short! Minimum ${minLength} characters required. Current: ${accessSecret.length}`
    );
  }

  if (refreshSecret.length < minLength) {
    throw new Error(
      `🔴 SECURITY ERROR: JWT_REFRESH_SECRET is too short! Minimum ${minLength} characters required. Current: ${refreshSecret.length}`
    );
  }

  // Warn if secrets are the same
  if (accessSecret === refreshSecret) {
    console.warn(
      "⚠️  WARNING: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET should be different for better security!"
    );
  }
}

export function generateAccessToken(payload: TokenPayload): string {
  const expiresIn = process.env.JWT_ACCESS_EXPIRY || "15m";
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn,
  } as jwt.SignOptions);
}

/** Staff access tokens: no `exp` claim so the session stays valid until explicit logout. */
export function generateStaffAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!);
}

export function generateRefreshToken(payload: TokenPayload): string {
  // No expiry by default; set JWT_REFRESH_EXPIRY (e.g. "7d") if you want expiry
  const expiresIn = process.env.JWT_REFRESH_EXPIRY;
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, expiresIn
    ? { expiresIn } as jwt.SignOptions
    : {});
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
}

export function generateRandomToken(): string {
  // Use cryptographically secure random bytes instead of Math.random()
  return crypto.randomBytes(32).toString("hex");
}
