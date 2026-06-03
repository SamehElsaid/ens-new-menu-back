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

type VerifyKitApiResponse = VerifyKitResponseBody & {
  user?: Awaited<ReturnType<typeof getAuthUserProfile>>;
};

function sendVerifyKitResponse(
  res: Response,
  status: number,
  body: VerifyKitApiResponse,
): void {
  res.status(status).json(body);
}

function extractSessionId(body: VerifyKitResponseBody): string | null {
  const sessionId = body.result?.sessionId;
  return typeof sessionId === "string" && sessionId.trim().length > 0
    ? sessionId.trim()
    : null;
}

function isCheckValidationSuccessful(body: VerifyKitResponseBody): boolean {
  const status = body.result?.validationStatus;
  return status === true || status === 1 || status === "true";
}

async function persistVerifiedPhoneForUser(
  userId: number,
  clientIp: string,
  sessionId: string,
): Promise<Awaited<ReturnType<typeof getAuthUserProfile>> | null> {
  const vk = await VerifyKitService.getValidationResult(clientIp, sessionId);

  if (vk.status < 200 || vk.status >= 300) {
    logger.warn("VerifyKit result failed during phone persist", {
      userId,
      sessionId,
      httpStatus: vk.status,
      errorCode: vk.body.meta?.errorCode,
    });
    return null;
  }

  const phoneNumber =
    typeof vk.body.result?.phoneNumber === "string"
      ? vk.body.result.phoneNumber.trim()
      : "";
  if (!phoneNumber) {
    logger.warn("VerifyKit result missing phoneNumber", { userId, sessionId });
    return null;
  }

  const countryCode =
    typeof vk.body.result?.countryCode === "string"
      ? vk.body.result.countryCode
      : null;

  await markUserPhoneVerified(userId, phoneNumber, countryCode);
  return getAuthUserProfile(userId);
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
    const clientIp = getClientIp(req);
    const result = await VerifyKitService.checkValidation(clientIp, reference);

    const responseBody: VerifyKitApiResponse = { ...result.body };

    if (
      req.user &&
      result.status >= 200 &&
      result.status < 300 &&
      isCheckValidationSuccessful(result.body)
    ) {
      const sessionId = extractSessionId(result.body);
      if (sessionId) {
        const user = await persistVerifiedPhoneForUser(
          req.user.userId,
          clientIp,
          sessionId,
        );
        if (user) {
          responseBody.user = user;
        }
      }
    }

    sendVerifyKitResponse(res, result.status, responseBody);
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

    const responseBody: VerifyKitApiResponse = { ...result.body };

    if (req.user && result.status >= 200 && result.status < 300) {
      const user = await persistVerifiedPhoneForUser(
        req.user.userId,
        clientIp,
        sessionId,
      );
      if (user) {
        responseBody.user = user;
      }
    }

    sendVerifyKitResponse(res, result.status, responseBody);
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

    console.log("[VerifyKit] complete → persist", {
      userId,
      sessionId,
      clientIp,
    });

    const user = await persistVerifiedPhoneForUser(
      userId,
      clientIp,
      sessionId,
    );

    if (!user) {
      sendApiError(res, req, 400, ApiErrors.verifykitResultFailed);
      return;
    }

    res.json({
      message: "Phone verified successfully",
      user,
    });
  } catch (error) {
    handleVerifyKitError(res, req, error, ApiErrors.verifykitResultFailed);
  }
}
