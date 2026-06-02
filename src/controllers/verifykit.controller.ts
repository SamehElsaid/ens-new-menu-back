import { Request, Response } from "express";
import {
  VerifyKitNotConfiguredError,
  VerifyKitResponseBody,
  VerifyKitService,
} from "../services/verifykit.service";
import { getClientIp } from "../utils/clientIp";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logger } from "../utils/logger";

function handleVerifyKitError(
  res: Response,
  req: Request,
  error: unknown,
  fallback: (typeof ApiErrors)[keyof typeof ApiErrors],
): void {
  if (error instanceof VerifyKitNotConfiguredError) {
    sendApiError(res, req, 503, ApiErrors.verifykitNotConfigured);
    return;
  }
  logger.error("VerifyKit controller error:", error);
  sendApiError(res, req, 500, fallback);
}

function sendVerifyKitResponse(
  res: Response,
  status: number,
  body: VerifyKitResponseBody,
): void {
  res.status(status).json(body);
}

export async function startWhatsAppDeeplink(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await VerifyKitService.startWhatsAppDeeplink(
      getClientIp(req),
      req.body,
    );
    sendVerifyKitResponse(res, result.status, result.body);
  } catch (error) {
    handleVerifyKitError(res, req, error, ApiErrors.verifykitStartFailed);
  }
}

export async function checkValidation(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { reference } = req.body;
    const result = await VerifyKitService.checkValidation(
      getClientIp(req),
      reference,
    );
    sendVerifyKitResponse(res, result.status, result.body);
  } catch (error) {
    handleVerifyKitError(res, req, error, ApiErrors.verifykitCheckFailed);
  }
}

export async function getResult(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.body;
    const result = await VerifyKitService.getValidationResult(
      getClientIp(req),
      sessionId,
    );
    sendVerifyKitResponse(res, result.status, result.body);
  } catch (error) {
    handleVerifyKitError(res, req, error, ApiErrors.verifykitResultFailed);
  }
}
