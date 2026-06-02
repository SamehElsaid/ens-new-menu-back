import { logger } from "../utils/logger";

const WEB_REST_BASE = "https://web-rest.verifykit.com/v1.0";
const API_BASE = "https://api.verifykit.com/v1.0";
const WHATSAPP_APP = "whatsapp";
const REFERENCE_IP_TTL_MS = 15 * 60 * 1000;

/** Same IP must be sent for /start and /check (VerifyKit binds reference to IP). */
const referenceClientIp = new Map<string, { ip: string; expiresAt: number }>();

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

export interface WhatsAppDeeplinkStartPayload {
  lang?: string;
  deeplink?: boolean;
  qrCode?: boolean;
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

function rememberReferenceIp(reference: string, clientIp: string): void {
  referenceClientIp.set(reference, {
    ip: clientIp,
    expiresAt: Date.now() + REFERENCE_IP_TTL_MS,
  });
}

function resolveClientIpForReference(
  reference: string,
  requestIp: string,
): string {
  const entry = referenceClientIp.get(reference);
  if (!entry) {
    return requestIp;
  }
  if (Date.now() > entry.expiresAt) {
    referenceClientIp.delete(reference);
    return requestIp;
  }
  return entry.ip;
}

function extractReference(body: VerifyKitResponseBody): string | null {
  const ref = body.result?.reference;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
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

  /** WhatsApp deeplink — user opens WhatsApp and sends the pre-filled message. */
  static async startWhatsAppDeeplink(
    clientIp: string,
    payload: WhatsAppDeeplinkStartPayload,
  ): Promise<VerifyKitProxyResult> {
    const deeplink = payload.deeplink ?? true;
    const qrCode = payload.qrCode ?? false;

    const result = await request(WEB_REST_BASE, "/start", clientIp, {
      app: WHATSAPP_APP,
      lang: payload.lang ?? "en",
      deeplink,
      qrCode,
    });

    const reference = extractReference(result.body);
    if (reference && result.status >= 200 && result.status < 300) {
      rememberReferenceIp(reference, clientIp);
    }

    return result;
  }

  /** Poll until user sent the WhatsApp message (validationStatus === true). */
  static checkValidation(
    clientIp: string,
    reference: string,
  ): Promise<VerifyKitProxyResult> {
    const ip = resolveClientIpForReference(reference, clientIp);
    return request(WEB_REST_BASE, "/check", ip, { reference });
  }

  static getValidationResult(
    clientIp: string,
    sessionId: string,
  ): Promise<VerifyKitProxyResult> {
    return request(API_BASE, "/result", clientIp, { sessionId });
  }
}
