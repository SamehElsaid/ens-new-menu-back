import { logger } from "../utils/logger";
import {
  broadcastStaffTableCall,
  type StaffTableCallBroadcastPayload,
} from "../socket/staffIoBroadcast";
import {
  getStaffPushTokensForMenu,
  type StaffOrderItem,
} from "./staffTableCall.service";
import {
  sendExpoPushNotifications,
  type ExpoPushMessage,
} from "./expoPush.service";
import { sendFcmToUser } from "./fcmPush.service";
import { getMenuOwnerUserId } from "../utils/menuAccess";

function buildPushTitle(payload: StaffTableCallBroadcastPayload): string {
  const table = payload.tableNumber || "?";
  if (payload.requestKind === "bill") {
    return `طلب الحساب - طاولة ${table}`;
  }
  if (payload.requestKind === "waiter") {
    return `استدعاء الويتر - طاولة ${table}`;
  }
  return `طلب جديد - طاولة ${table}`;
}

/** Arabic currency-less summary for a new table call. */
function buildPushBody(payload: StaffTableCallBroadcastPayload): string {
  if (payload.requestKind === "bill") {
    return payload.customerName
      ? `${payload.customerName} · يطلب الحساب`
      : "الزبون يطلب الحساب";
  }
  if (payload.requestKind === "waiter") {
    return payload.customerName
      ? `${payload.customerName} · يطلب الويتر`
      : "الزبون يطلب الويتر";
  }
  const parts: string[] = [];
  if (payload.customerName) {
    parts.push(payload.customerName);
  }
  const itemCount =
    (payload.items ?? []).reduce(
      (sum: number, it: StaffOrderItem) => sum + (it.quantity || 0),
      0,
    ) || 0;
  if (itemCount > 0) {
    parts.push(`${itemCount} صنف`);
  }
  if (payload.orderTotal > 0) {
    parts.push(`الإجمالي ${payload.orderTotal}`);
  }
  if (!parts.length) {
    parts.push("طلب استدعاء جديد");
  }
  return parts.join(" · ");
}

/**
 * Fan-out a new guest → staff table call:
 * - Emits `staff:table_call` to the `menu:{menuId}` room (Socket.IO).
 * - Sends an Expo push notification to every active staff member that has
 *   a stored `expoPushToken` for this menu.
 * - Sends a web FCM notification to the menu owner (dashboard `Users.fcmToken`)
 *   so the Activity / History page can be surfaced when the browser is in the background.
 *
 * Push failures are swallowed (logged) so they never block the socket
 * broadcast or the REST response.
 */
export async function notifyStaffOfTableCall(
  menuId: number,
  payload: StaffTableCallBroadcastPayload,
): Promise<void> {
  broadcastStaffTableCall(menuId, payload);

  try {
    const ownerUserId = await getMenuOwnerUserId(menuId);
    if (ownerUserId != null) {
      const base = (
        process.env.FRONTEND_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        ""
      )
        .trim()
        .replace(/\/$/u, "");
      const historyUrl =
        base.startsWith("https://") || base.startsWith("http://")
          ? `${base}/dashboard/${menuId}/history`
          : undefined;

      void sendFcmToUser(ownerUserId, {
        title: buildPushTitle(payload),
        body: buildPushBody(payload),
        data: {
          type: "table_call",
          menuId: payload.menuId,
          callId: payload.id,
          tableNumber: payload.tableNumber,
          orderTotal: payload.orderTotal,
          status: payload.status,
          requestKind: payload.requestKind ?? "order",
          at: payload.at,
          ...(historyUrl ? { url: historyUrl } : {}),
        },
      }).catch((e) => {
        logger.warn("notifyStaffOfTableCall: owner FCM send failed", {
          menuId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }
  } catch (e) {
    logger.warn("notifyStaffOfTableCall: owner FCM fan-out failed", {
      menuId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    const tokens = await getStaffPushTokensForMenu(menuId);
    if (!tokens.length) return;

    const title = buildPushTitle(payload);
    const body = buildPushBody(payload);

    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title,
      body,
      sound: "default",
      priority: "high",
      channelId: "high_priority",
      data: {
        type: "table-call",
        data: {
          screen: "staff-call",
          callId: payload.id,
          menuId: payload.menuId,
          tableNumber: payload.tableNumber,
          customerName: payload.customerName,
          orderTotal: payload.orderTotal,
          status: payload.status,
          requestKind: payload.requestKind ?? "order",
          at: payload.at,
        },
      },
    }));

    await sendExpoPushNotifications(messages);
  } catch (err) {
    logger.warn("notifyStaffOfTableCall push failed", {
      menuId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
