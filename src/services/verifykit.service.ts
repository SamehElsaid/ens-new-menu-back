import { logger } from "../utils/logger";

const WEB_REST_BASE = "https://web-rest.verifykit.com/v1.0";
const API_BASE = "https://api.verifykit.com/v1.0";
const WHATSAPP_APP = "whatsapp";

export class VerifyKitNotConfiguredError extends Error {
  constructor() {
    super("VERIFYKIT_SERVER_KEY is not configured");
    this.name = "VerifyKitNotConfiguredError";
  }
}

export interface VerifyKitResponseBody {
  meta?: {
    requestId?: string;
    httpStatusCode?: number;
    errorMessage?: string;
    errorCode?: string | number;
  };
  result?: Record<string, unknown>;
}

export interface VerifyKitProxyResult {
  status: number;
  body: VerifyKitResponseBody;
}

export interface WhatsAppOtpStartPayload {
  phoneNumber: string;
  lang?: string;
}

function getServerKey(): string {
  const key = process.env.VERIFYKIT_SERVER_KEY?.trim();
  if (!key) {
    throw new VerifyKitNotConfiguredError();
  }
  return key;
}

function buildHeaders(clientIp: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Vfk-Server-Key": getServerKey(),
    "X-Vfk-Forwarded-For": clientIp,
  };
}

async function request(
  baseUrl: string,
  path: string,
  clientIp: string,
  body: Record<string, unknown>,
): Promise<VerifyKitProxyResult> {
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(clientIp),
    body: JSON.stringify(body),
  });

  const raw = await response.json().catch(() => ({}));
  const parsed: VerifyKitResponseBody =
    typeof raw === "object" && raw !== null ? (raw as VerifyKitResponseBody) : {};

  if (!response.ok) {
    logger.warn("VerifyKit API error", {
      path,
      status: response.status,
      errorCode: parsed.meta?.errorCode,
      errorMessage: parsed.meta?.errorMessage,
    });
  }

  return {
    status: response.status,
    body: parsed,
  };
}

export class VerifyKitService {
  static isConfigured(): boolean {
    return Boolean(process.env.VERIFYKIT_SERVER_KEY?.trim());
  }

  static startWhatsAppOtp(
    clientIp: string,
    payload: WhatsAppOtpStartPayload,
  ): Promise<VerifyKitProxyResult> {
    return request(WEB_REST_BASE, "/start", clientIp, {
      app: WHATSAPP_APP,
      phoneNumber: payload.phoneNumber,
      ...(payload.lang ? { lang: payload.lang } : {}),
    });
  }

  static checkWhatsAppOtp(
    clientIp: string,
    reference: string,
    code: string,
  ): Promise<VerifyKitProxyResult> {
    return request(WEB_REST_BASE, "/check-whatsapp", clientIp, {
      reference,
      code,
    });
  }

  static getValidationResult(
    clientIp: string,
    sessionId: string,
  ): Promise<VerifyKitProxyResult> {
    return request(API_BASE, "/result", clientIp, { sessionId });
  }
}
