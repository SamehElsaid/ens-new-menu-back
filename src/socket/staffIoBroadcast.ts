import type { Server as SocketIOServer } from "socket.io";
import type { StaffOrderItem } from "../services/staffTableCall.service";

let ioInstance: SocketIOServer | null = null;

export function setStaffNotificationsIo(io: SocketIOServer): void {
  ioInstance = io;
}

/** Emitted to room `menu:{menuId}` when a guest calls staff (bell / order). */
export type StaffTableCallBroadcastPayload = {
  id: number;
  menuId: number;
  tableNumber: string;
  at: string;
  /** Name entered by the guest (who is ordering). */
  customerName: string | null;
  /** Line items (product names and optional menuItemId / qty). */
  items: StaffOrderItem[];
};

export function broadcastStaffTableCall(
  menuId: number,
  payload: StaffTableCallBroadcastPayload,
): void {
  ioInstance?.to(`menu:${menuId}`).emit("staff:table_call", payload);
}
