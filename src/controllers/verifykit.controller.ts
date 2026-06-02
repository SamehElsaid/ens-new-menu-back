import { Request, Response } from "express";
import {
  VerifyKitNotConfiguredError,
  VerifyKitResponseBody,
  VerifyKitService,
} from "../services/verifykit.service";
import { markUserPhoneVerified } from "../services/verifykitUser.service";
import { getAuthUserProfile } from "../services/userProfile.service";
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
    const clientIp = getClientIp(req);
    const result = await VerifyKitService.getValidationResult(
      clientIp,
      sessionId,
    );

    console.log("[VerifyKit] POST /v1.0/result", {
      sessionId,
      clientIp,
      httpStatus: result.status,
      meta: result.body.meta,
      result: result.body.result,
    });

    sendVerifyKitResponse(res, result.status, result.body);
  } catch (error) {
    handleVerifyKitError(res, req, error, ApiErrors.verifykitResultFailed);
  }
}

/** After WhatsApp deeplink success: save verified phone and mark account. */
export async function completePhoneVerification(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { sessionId } = req.body;
    const clientIp = getClientIp(req);

    const vk = await VerifyKitService.getValidationResult(clientIp, sessionId);

    console.log("[VerifyKit] complete → /v1.0/result", {
      userId,
      sessionId,
      clientIp,
      httpStatus: vk.status,
      meta: vk.body.meta,
      result: vk.body.result,
    });

    if (vk.status < 200 || vk.status >= 300) {
      sendVerifyKitResponse(res, vk.status, vk.body);
      return;
    }

    const phoneNumber =
      typeof vk.body.result?.phoneNumber === "string"
        ? vk.body.result.phoneNumber.trim()
        : "";
    if (!phoneNumber) {
      sendApiError(res, req, 400, ApiErrors.verifykitResultFailed);
      return;
    }

    const countryCode =
      typeof vk.body.result?.countryCode === "string"
        ? vk.body.result.countryCode
        : null;

    await markUserPhoneVerified(userId, phoneNumber, countryCode);

    const user = await getAuthUserProfile(userId);

    res.json({
      message: "Phone verified successfully",
      user,
      verifyKit: vk.body.result,
    });
  } catch (error) {
    handleVerifyKitError(res, req, error, ApiErrors.verifykitResultFailed);
  }
}
