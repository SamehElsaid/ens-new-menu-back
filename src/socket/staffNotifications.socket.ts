import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { logger } from "../utils/logger";
import { verifyAccessToken } from "../utils/tokenHelper";
import { TokenBlacklistService } from "../services/tokenBlacklist.service";
import { corsOriginDelegate } from "../config/corsOrigins";
import { ROLES } from "../config/constants";
import {
  getMenuIdForStaff,
  getPendingStaffTableCalls,
  processGuestStaffCall,
} from "../services/staffTableCall.service";
import { broadcastStaffTableCall } from "./staffIoBroadcast";

const roomForMenu = (menuId: number) => `menu:${menuId}`;

export function attachStaffNotificationsSocket(
  httpServer: HttpServer,
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io/",
    cors: {
      origin: corsOriginDelegate,
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    socket.on("staff:join", async (payload: { token?: string }, cb) => {
      const reply = (data: Record<string, unknown>) => {
        try {
          cb?.(data);
        } catch {
          /* client disconnected */
        }
      };

      try {
        const raw = payload?.token?.replace(/^Bearer\s+/i, "").trim();
        if (!raw) {
          reply({ ok: false, error: "NO_TOKEN" });
          return;
        }

        const blacklisted = await TokenBlacklistService.isBlacklisted(raw);
        if (blacklisted) {
          reply({ ok: false, error: "REVOKED" });
          return;
        }

        const decoded = verifyAccessToken(raw);
        if (decoded.role !== ROLES.STAFF) {
          reply({ ok: false, error: "NOT_STAFF" });
          return;
        }

        const menuId = await getMenuIdForStaff(decoded.userId);
        if (menuId === null) {
          reply({ ok: false, error: "STAFF_NOT_FOUND" });
          return;
        }
        await socket.join(roomForMenu(menuId));
        (socket.data as { staffMenuId?: number }).staffMenuId = menuId;
        reply({ ok: true, menuId });

        const pending = await getPendingStaffTableCalls(menuId, 100);
        socket.emit("staff:pending_calls", {
          calls: pending.map((c) => ({
            id: c.id,
            menuId: c.menuId,
            tableNumber: c.tableNumber,
            at: c.createdAt.toISOString(),
          })),
        });
      } catch (e) {
        logger.warn("staff:join failed", e);
        reply({ ok: false, error: "AUTH_FAILED" });
      }
    });

    socket.on(
      "guest:call_staff",
      async (payload: { menuId?: number; tableNumber?: string }, cb) => {
        const reply = (data: Record<string, unknown>) => {
          try {
            cb?.(data);
          } catch {
            /* noop */
          }
        };

        try {
          const menuId = Number(payload?.menuId);
          const tableNumber = String(payload?.tableNumber ?? "").trim();
          const result = await processGuestStaffCall(menuId, tableNumber);

          if (!result.ok) {
            reply({ ok: false, error: result.error });
            return;
          }

          broadcastStaffTableCall(result.menuId, {
            id: result.id,
            menuId: result.menuId,
            tableNumber: result.tableNumber,
            at: result.createdAt.toISOString(),
          });
          reply({ ok: true });
        } catch (e) {
          logger.error("guest:call_staff error:", e);
          reply({ ok: false, error: "SERVER_ERROR" });
        }
      },
    );
  });

  return io;
}
