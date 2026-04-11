import type { Server as SocketIOServer } from "socket.io";

let ioInstance: SocketIOServer | null = null;

export function setStaffNotificationsIo(io: SocketIOServer): void {
  ioInstance = io;
}

export function broadcastStaffTableCall(
  menuId: number,
  payload: { id: number; menuId: number; tableNumber: string; at: string },
): void {
  ioInstance?.to(`menu:${menuId}`).emit("staff:table_call", payload);
}
