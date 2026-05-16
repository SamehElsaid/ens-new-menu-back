import { logger } from "../utils/logger";

/**
 * Minimal Expo Push API client. Documentation:
 * https://docs.expo.dev/push-notifications/sending-notifications/#http2-api
 *
 * We post directly to the HTTP endpoint instead of using `expo-server-sdk`
 * to keep the dependency surface small.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Expo allows up to 100 messages per request.
const BATCH_SIZE = 100;
const EXPO_FETCH_TIMEOUT_MS = 8_000;

export type ExpoPushMessage = {
  to: string | string[];
  title?: string;
  body?: string;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  /** Android notification channel id (must be created in the app). */
  channelId?: string;
  data?: Record<string, unknown>;
  badge?: number;
  /** Time-to-live in seconds. */
  ttl?: number;
};

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | {
      status: "error";
      message: string;
      details?: { error?: string };
    };

type ExpoPushResponse = {
  data?: ExpoPushTicket[] | ExpoPushTicket;
  errors?: unknown;
};

export function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") ||
      token.startsWith("ExpoPushToken["))
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Send one or more Expo push messages. Fire-and-forget safe: never throws.
 * Messages with invalid tokens are dropped. Errors per-message are logged
 * but never stop the rest of the batch.
 */
export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[],
): Promise<void> {
  const cleaned = messages.filter((m) => {
    const tokens = Array.isArray(m.to) ? m.to : [m.to];
    return tokens.length > 0 && tokens.every(isExpoPushToken);
  });
  if (!cleaned.length) return;

  const batches = chunk(cleaned, BATCH_SIZE);

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(EXPO_FETCH_TIMEOUT_MS),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          logger.warn("Expo push HTTP error", {
            status: res.status,
            statusText: res.statusText,
            body: text.slice(0, 500),
          });
          return;
        }

        const json = (await res.json()) as ExpoPushResponse;
        const tickets = Array.isArray(json.data)
          ? json.data
          : json.data
            ? [json.data]
            : [];
        const errors = tickets.filter((t) => t.status === "error");
        if (errors.length) {
          logger.warn("Expo push tickets with errors", {
            count: errors.length,
            sample: errors.slice(0, 3),
          });
        }
      } catch (err) {
        logger.warn("Expo push request failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}
