import type { Server as SocketIOServer } from "socket.io";
import type {
  StaffOrderItem,
  StaffTableCallStatus,
} from "../services/staffTableCall.service";

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
  /** Line items (resolved unit price, line total per row). */
  items: StaffOrderItem[];
  /** Sum of line totals. */
  orderTotal: number;
  /** New orders from the view start as `pending`. */
  status: StaffTableCallStatus;
  /** Filled when staff changes items after create (if DB has last-edited columns). */
  lastEditedByStaffId?: number | null;
  lastEditedAt?: string | null;
  lastEditedByName?: string | null;
};

/** After confirm / cancel / staff edits while pending. */
export type StaffTableCallChangedPayload = StaffTableCallBroadcastPayload;

export function broadcastStaffTableCall(
  menuId: number,
  payload: StaffTableCallBroadcastPayload,
): void {
  ioInstance?.to(`menu:${menuId}`).emit("staff:table_call", payload);
}

export function broadcastStaffTableCallChanged(
  menuId: number,
  payload: StaffTableCallChangedPayload,
): void {
  ioInstance?.to(`menu:${menuId}`).emit("staff:table_call_changed", payload);
}
