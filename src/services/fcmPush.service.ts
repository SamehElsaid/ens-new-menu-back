import {
  getFirebaseAdminProjectId,
  getFirebaseMessaging,
} from "../config/firebase-admin";
import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";

export const MAX_FCM_TOKEN_LEN = 512;

/**
 * Load stored FCM registration token for a user (set from the mobile app).
 */
export async function getUserFcmToken(userId: number): Promise<string | null> {
  try {
    const pool = await getPool();
    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT fcmToken
        FROM Users
        WHERE id = @userId
      `);
    const row = result.recordset[0] as { fcmToken?: string | null } | undefined;
    const t = row?.fcmToken?.trim();
    return t || null;
  } catch (error) {
    logger.error("getUserFcmToken error:", error);
    return null;
  }
}

/**
 * Persist or clear the device FCM token for push notifications.
 */
export async function saveUserFcmToken(
  userId: number,
  token: string | null,
): Promise<boolean> {
  try {
    const pool = await getPool();
    await pool.request().input("userId", sql.Int, userId).input(
      "token",
      sql.NVarChar,
      token,
    ).query(`
        UPDATE Users
        SET fcmToken = @token
        WHERE id = @userId
      `);
    return true;
  } catch (error) {
    logger.error("saveUserFcmToken error:", error);
    return false;
  }
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

/**
 * Send one push to the user's saved FCM token. Safe to fire-and-forget.
 */
export async function sendFcmToUser(
  userId: number,
  tray: FcmTrayPayload,
): Promise<void> {
  const token = await getUserFcmToken(userId);
  if (!token) return;

  const data = stringifyData({
    ...(tray.data ?? {}),
  });

  try {
    const messaging = getFirebaseMessaging();
    await messaging.send({
      token,
      notification: {
        title: tray.title,
        body: tray.body,
      },
      data,
      android: {
        priority: "high",
        notification: {
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });
  } catch (error: unknown) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
    ) {
      await saveUserFcmToken(userId, null);
    }
    if (code === "messaging/mismatched-credential") {
      logger.warn(
        "sendFcmToUser: SenderId mismatch — Admin SDK project does not match the app that registered this token. Set FIREBASE_SERVICE_ACCOUNT_PATH or align the mobile app Firebase project.",
        { userId, adminProjectId: getFirebaseAdminProjectId() },
      );
    }
    logger.warn("sendFcmToUser failed", {
      userId,
      code,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
