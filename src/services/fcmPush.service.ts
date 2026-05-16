import {
  getFirebaseAdminProjectId,
  getFirebaseMessaging,
} from "../config/firebase-admin";
import type {
  Messaging,
  MulticastMessage,
  WebpushConfig,
} from "firebase-admin/messaging";
import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";

export const MAX_FCM_TOKEN_LEN = 512;
/** Max simultaneous device tokens per user (FCM registration tokens). */
export const MAX_FCM_TOKENS_PER_USER = 25;

const FCM_MULTICAST_CHUNK = 500;

/**
 * Recover tokens from truncated / invalid JSON (e.g. NVARCHAR(512) cut mid-array).
 * FCM registration tokens often contain ":" and "." — do not restrict to [A-Za-z0-9_-].
 */
function extractTokensFromCorruptJson(s: string): string[] {
  const re = /"([^"]{80,512})"/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const t = m[1].trim();
    if (t.length >= 80 && t.length <= MAX_FCM_TOKEN_LEN) found.push(t);
  }
  return [...new Set(found)];
}

function parseStoredFcmTokens(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  let s = String(raw).trim();
  if (!s) return [];
  // Double-encoded JSON string in DB, e.g. "\"[\\\"a\\\",\\\"b\\\"]\""
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      const once = JSON.parse(s) as unknown;
      if (typeof once === "string") {
        const inner = once.trim();
        if (inner.startsWith("[")) s = inner;
      }
    } catch {
      /* keep s */
    }
  }
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as unknown;
      if (Array.isArray(arr)) {
        const out: string[] = [];
        for (const x of arr) {
          if (typeof x !== "string") continue;
          const t = x.trim();
          if (t && t.length <= MAX_FCM_TOKEN_LEN) out.push(t);
        }
        const deduped = [...new Set(out)];
        if (deduped.length > 0) return deduped;
      }
    } catch {
      /* fall through to recovery */
    }
    const recovered = extractTokensFromCorruptJson(s);
    return recovered.filter((t) => t.length <= MAX_FCM_TOKEN_LEN);
  }
  if (s.length <= MAX_FCM_TOKEN_LEN) return [s];
  return [];
}

function serializeFcmTokens(tokens: string[]): string | null {
  const unique = [
    ...new Set(tokens.map((t) => t.trim()).filter(Boolean)),
  ].filter((t) => t.length <= MAX_FCM_TOKEN_LEN);
  if (unique.length === 0) return null;
  return JSON.stringify(unique);
}

async function loadRawFcmColumn(userId: number): Promise<string | null> {
  const pool = await getPool();
  const result = await pool.request().input("userId", sql.Int, userId).query(`
      SELECT fcmToken
      FROM Users
      WHERE id = @userId
    `);
  const row = result.recordset[0] as { fcmToken?: unknown } | undefined;
  const t = row?.fcmToken;
  if (t == null) return null;
  if (Buffer.isBuffer(t)) {
    const s = t.toString("utf8").trim();
    return s || null;
  }
  if (Array.isArray(t)) {
    const strs = t
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim());
    return serializeFcmTokens(strs);
  }
  if (typeof t !== "string") {
    logger.warn("loadRawFcmColumn: unexpected type for fcmToken column", {
      userId,
      type: typeof t,
    });
    return null;
  }
  const s = t.trim();
  return s || null;
}

async function persistUserFcmTokens(
  userId: number,
  tokens: string[],
): Promise<boolean> {
  try {
    const pool = await getPool();
    const serialized = serializeFcmTokens(tokens);
    if (serialized && serialized.length > 480) {
      logger.warn(
        "persistUserFcmTokens: serialized token list is long — ensure Users.fcmToken is NVARCHAR(MAX) (see database/alter_users_fcmtoken_nvarchar_max.sql)",
        { userId, length: serialized.length },
      );
    }
    await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("token", sql.NVarChar(sql.MAX), serialized).query(`
        UPDATE Users
        SET fcmToken = @token
        WHERE id = @userId
      `);
    return true;
  } catch (error) {
    logger.error("persistUserFcmTokens error:", error);
    return false;
  }
}

/** All stored FCM registration tokens for the user (deduplicated). */
export async function getUserFcmTokens(userId: number): Promise<string[]> {
  try {
    const raw = await loadRawFcmColumn(userId);
    const parsed = parseStoredFcmTokens(raw);
    if (parsed.length === 0 && raw != null && String(raw).trim() !== "") {
      logger.warn(
        "getUserFcmTokens: fcmToken column is non-empty but no tokens parsed (corrupt JSON or column truncation)",
        {
          userId,
          rawLength: String(raw).length,
          rawPrefix: String(raw).slice(0, 120),
        },
      );
    }
    return parsed;
  } catch (error) {
    logger.error("getUserFcmTokens error:", error);
    return [];
  }
}

export type AddUserFcmTokenResult = "ok" | "already" | "max" | "error";

/** Append a device token if not already present (respects max devices). */
export async function addUserFcmToken(
  userId: number,
  token: string,
): Promise<AddUserFcmTokenResult> {
  const t = token.trim();
  if (!t || t.length > MAX_FCM_TOKEN_LEN) return "error";
  try {
    const raw = await loadRawFcmColumn(userId);
    const existing = parseStoredFcmTokens(raw);
    if (existing.includes(t)) return "already";
    if (existing.length >= MAX_FCM_TOKENS_PER_USER) {
      logger.warn("addUserFcmToken: max devices reached", { userId });
      return "max";
    }
    const ok = await persistUserFcmTokens(userId, [...existing, t]);
    return ok ? "ok" : "error";
  } catch (error) {
    logger.error("addUserFcmToken error:", error);
    return "error";
  }
}

/** Remove one device token (e.g. on logout from that device). */
export async function removeUserFcmToken(
  userId: number,
  token: string,
): Promise<boolean> {
  const t = token.trim();
  if (!t) return true;
  try {
    const raw = await loadRawFcmColumn(userId);
    const existing = parseStoredFcmTokens(raw);
    const next = existing.filter((x) => x !== t);
    if (next.length === existing.length) return true;
    return await persistUserFcmTokens(userId, next);
  } catch (error) {
    logger.error("removeUserFcmToken error:", error);
    return false;
  }
}

export async function clearUserFcmTokens(userId: number): Promise<boolean> {
  return persistUserFcmTokens(userId, []);
}

/** FCM data payload keys must all be strings. */
function stringifyData(
  record: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(record)) {
    if (val === undefined || val === null) continue;
    out[key] = typeof val === "string" ? val : JSON.stringify(val);
  }
  return out;
}

export type FcmTrayPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

async function sendFcmToSingleToken(
  messaging: Messaging,
  userId: number,
  token: string,
  notification: { title: string; body: string },
  data: Record<string, string>,
  clickLink: string | undefined,
  logContext: "fallback" | "multicast-throw",
): Promise<void> {
  try {
    await messaging.send({
      token,
      notification,
      webpush: {
        headers: { Urgency: "high" },
        notification: { ...notification },
        ...(Object.keys(data).length > 0 ? { data: { ...data } } : {}),
        ...(clickLink ? { fcmOptions: { link: clickLink } } : {}),
      },
      ...(Object.keys(data).length > 0 ? { data } : {}),
    });
    logger.info(`sendFcmToUser: ${logContext} per-token ok`, { userId });
  } catch (e: unknown) {
    const code =
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      typeof (e as { code: unknown }).code === "string"
        ? (e as { code: string }).code
        : undefined;
    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
    ) {
      void removeUserFcmToken(userId, token);
    }
    logger.warn(`sendFcmToUser: ${logContext} per-token failed`, {
      userId,
      code,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Send one push to every saved FCM token for the user. Invalid tokens are removed per-device.
 */
export async function sendFcmToUser(
  userId: number,
  tray: FcmTrayPayload,
): Promise<void> {
  const tokens = await getUserFcmTokens(userId);
  if (tokens.length === 0) return;

  const data = stringifyData({
    ...(tray.data ?? {}),
  });

  const messaging = getFirebaseMessaging();

  const notification = { title: tray.title, body: tray.body };

  const baseUrl = (
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    ""
  ).trim();
  const clickLink = baseUrl.startsWith("https://")
    ? baseUrl.replace(/\/$/u, "")
    : undefined;

  const webpush: WebpushConfig = {
    headers: {
      Urgency: "high",
    },
    notification: { ...notification },
  };
  if (Object.keys(data).length > 0) {
    webpush.data = { ...data };
  }
  if (clickLink) {
    webpush.fcmOptions = { link: clickLink };
  }

  for (let i = 0; i < tokens.length; i += FCM_MULTICAST_CHUNK) {
    const chunk = tokens.slice(i, i + FCM_MULTICAST_CHUNK);
    const multicast: MulticastMessage = {
      tokens: chunk,
      notification,
      webpush,
    };
    if (Object.keys(data).length > 0) {
      multicast.data = data;
    }

    try {
      const batch = await messaging.sendEachForMulticast(multicast);
      if (batch.successCount > 0) {
        logger.info("sendFcmToUser: batch delivered", {
          userId,
          successCount: batch.successCount,
          failureCount: batch.failureCount,
        });
      }
      batch.responses.forEach((r, idx) => {
        const code = r.error?.code;
        const token = chunk[idx];

        if (r.success) return;

        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          void removeUserFcmToken(userId, token);
        }
        if (code === "messaging/mismatched-credential") {
          logger.warn(
            "sendFcmToUser: SenderId mismatch — Admin SDK project does not match the app that registered this token.",
            { userId, adminProjectId: getFirebaseAdminProjectId() },
          );
        }
        logger.warn("sendFcmToUser: one recipient failed", {
          userId,
          code,
          error: r.error?.message ?? String(r.error),
        });
      });

      // Fallback: multicast accepted but every recipient failed (e.g. strict payload) — try per-token send.
      if (batch.failureCount === chunk.length && batch.successCount === 0) {
        for (const token of chunk) {
          await sendFcmToSingleToken(
            messaging,
            userId,
            token,
            notification,
            data,
            clickLink,
            "fallback",
          );
        }
      }
    } catch (error: unknown) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined;
      if (code === "messaging/mismatched-credential") {
        logger.warn(
          "sendFcmToUser: SenderId mismatch — Admin SDK project does not match the app that registered this token.",
          { userId, adminProjectId: getFirebaseAdminProjectId() },
        );
      }
      logger.warn("sendFcmToUser: multicast batch failed", {
        userId,
        code,
        error: error instanceof Error ? error.message : String(error),
      });
      // Multicast threw before any delivery — still try each device (same payload as fallback).
      for (const token of chunk) {
        await sendFcmToSingleToken(
          messaging,
          userId,
          token,
          notification,
          data,
          clickLink,
          "multicast-throw",
        );
      }
    }
  }
}
