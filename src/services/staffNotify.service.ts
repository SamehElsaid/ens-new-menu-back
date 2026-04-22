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

/** Arabic currency-less summary for a new table call. */
function buildPushBody(payload: StaffTableCallBroadcastPayload): string {
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
    const tokens = await getStaffPushTokensForMenu(menuId);
    if (!tokens.length) return;

    const title = `طلب جديد - طاولة ${payload.tableNumber}`;
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
