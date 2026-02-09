import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '../config/constants';

// Auth endpoints limiter
export const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.AUTH.windowMs,
  max: RATE_LIMITS.AUTH.max,
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: Math.ceil(RATE_LIMITS.AUTH.windowMs / 1000 / 60),
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test and development
  skip: (req) => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development',
});

// API endpoints limiter
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.API.windowMs,
  max: RATE_LIMITS.API.max,
  message: {
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test and development
  skip: (req) => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development',
});

// Public endpoints limiter
export const publicLimiter = rateLimit({
  windowMs: RATE_LIMITS.PUBLIC.windowMs,
  max: RATE_LIMITS.PUBLIC.max,
  message: {
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test and development
  skip: (req) => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development',
});

// Upload limiter
export const uploadLimiter = rateLimit({
  windowMs: RATE_LIMITS.UPLOAD.windowMs,
  max: RATE_LIMITS.UPLOAD.max,
  message: {
    error: 'Too many file uploads, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test and development
  skip: (req) => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development',
});

// Password reset limiter
export const passwordResetLimiter = rateLimit({
  windowMs: RATE_LIMITS.PASSWORD_RESET.windowMs,
  max: RATE_LIMITS.PASSWORD_RESET.max,
  message: {
    error: 'Too many password reset attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
});

// Email verification limiter
export const emailVerificationLimiter = rateLimit({
  windowMs: RATE_LIMITS.EMAIL_VERIFICATION.windowMs,
  max: RATE_LIMITS.EMAIL_VERIFICATION.max,
  message: {
    error: 'Too many verification emails sent, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test and development
  skip: (req) => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development',
});


