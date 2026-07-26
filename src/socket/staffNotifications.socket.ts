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
import { menuOwnerHasCapability } from "../services/planCapabilities.service";
import { notifyStaffOfTableCall } from "../services/staffNotify.service";
import { verifyMenuAccessForSocket } from "../utils/menuAccess";
import { authorization } from "../services/authorization.service";

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
        if (
          !(await menuOwnerHasCapability(menuId, "liveOrderNotifications"))
        ) {
          reply({ ok: false, error: "PRO_REQUIRED" });
          return;
        }

        // RBAC: staff must have orders:view or delivery:view for the order feed.
        if (typeof decoded.staffRoleId !== "number") {
          reply({ ok: false, error: "ROLE_REQUIRED" });
          return;
        }
        const staffActor = {
          kind: "staff" as const,
          staffId: decoded.userId,
          staffRoleId: decoded.staffRoleId,
          menuId,
        };
        const channel =
          await authorization.resolveOrderChannelFilter(staffActor);
        if (!channel) {
          reply({ ok: false, error: "FORBIDDEN" });
          return;
        }

        await socket.join(roomForMenu(menuId));
        (socket.data as { staffMenuId?: number }).staffMenuId = menuId;
        reply({ ok: true, menuId });

        const pending = await getPendingStaffTableCalls(menuId, 100, channel);
        socket.emit("staff:pending_calls", {
          calls: pending.map((c) => ({
            id: c.id,
            menuId: c.menuId,
            tableNumber: c.tableNumber,
            at: c.createdAt.toISOString(),
            customerName: c.customerName,
            items: c.items,
            orderTotal: c.orderTotal,
            status: c.status,
          })),
        });
      } catch (e) {
        logger.warn("staff:join failed", e);
        reply({ ok: false, error: "AUTH_FAILED" });
      }
    });

    socket.on(
      "dashboard:menu_subscribe",
      async (
        payload: { token?: string; menuId?: number },
        cb?: (data: Record<string, unknown>) => void,
      ) => {
        const reply = (data: Record<string, unknown>) => {
          try {
            cb?.(data);
          } catch {
            /* noop */
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
          const menuId = Number(payload?.menuId);
          if (!Number.isFinite(menuId) || menuId <= 0) {
            reply({ ok: false, error: "INVALID_MENU" });
            return;
          }

          const allowed = await verifyMenuAccessForSocket(
            decoded.userId,
            decoded.role,
            menuId,
            "orders:view",
          );
          // Delivery-only staff may subscribe without orders:view.
          const deliveryAllowed =
            !allowed &&
            (await verifyMenuAccessForSocket(
              decoded.userId,
              decoded.role,
              menuId,
              "delivery:view",
            ));
          if (!allowed && !deliveryAllowed) {
            reply({ ok: false, error: "FORBIDDEN" });
            return;
          }

          await socket.join(roomForMenu(menuId));
          reply({ ok: true, menuId });
        } catch (e) {
          logger.warn("dashboard:menu_subscribe failed", e);
          reply({ ok: false, error: "AUTH_FAILED" });
        }
      },
    );

    socket.on(
      "guest:call_staff",
      async (
        payload: {
          menuId?: number;
          tableNumber?: string;
          customerName?: string;
          items?: unknown;
          status?: unknown;
          governorateId?: number;
          customerPhone?: string;
          customerAddress?: string;
          orderNotes?: string;
          type?: "table" | "delivery";
          requestKind?: "order" | "waiter" | "bill";
        },
        cb,
      ) => {
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
          const result = await processGuestStaffCall(menuId, tableNumber, {
            customerName: payload?.customerName,
            customerPhone: payload?.customerPhone,
            customerAddress: payload?.customerAddress,
            orderNotes: payload?.orderNotes,
            type: payload?.type,
            requestKind: payload?.requestKind,
            items: payload?.items,
            status: payload?.status,
            governorateId: payload?.governorateId,
          });

          if (!result.ok) {
            reply({ ok: false, error: result.error });
            return;
          }

          await notifyStaffOfTableCall(result.menuId, {
            id: result.id,
            menuId: result.menuId,
            tableNumber: result.tableNumber,
            at: result.createdAt.toISOString(),
            customerName: result.customerName,
            items: result.items,
            orderTotal: result.orderTotal,
            status: result.status,
            requestKind: result.requestKind,
          });
          reply({ ok: true, id: result.id, requestKind: result.requestKind });
        } catch (e) {
          logger.error("guest:call_staff error:", e);
          reply({ ok: false, error: "SERVER_ERROR" });
        }
      },
    );
  });

  return io;
}
