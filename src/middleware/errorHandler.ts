import { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../utils/logger";
import { pickLocalized, sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
    /** Arabic text when `message` is English-only */
    public messageAr?: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/** Alias for payment module & legacy call sites. */
export class ApiError extends AppError {}

/**
 * Express async route wrapper: forwards rejections to `next` so errorHandler can respond.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof AppError) {
    logger.error(
      `${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`,
    );
    const en = err.message;
    const ar = err.messageAr ?? err.message;
    res.status(err.statusCode).json({
      error: pickLocalized(req, { en, ar }),
      errorAr: ar,
      errorEn: en,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
    return;
  }

  // Unhandled errors
  logger.error(
    `500 - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`,
    { stack: err.stack },
  );

  sendApiError(res, req, 500, ApiErrors.internalServerError, {
    ...(process.env.NODE_ENV === "development" && {
      message: err.message,
      stack: err.stack,
    }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  sendApiError(res, req, 404, ApiErrors.routeNotFound, {
    path: req.originalUrl,
  });
}
