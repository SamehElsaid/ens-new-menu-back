import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import { verifyAccessToken } from "../utils/tokenHelper";
import { TokenBlacklistService } from "../services/tokenBlacklist.service";
import { corsOriginDelegate } from "../config/corsOrigins";

const roomForMenu = (menuId: number) => `menu:${menuId}`;

const lastGuestCall = new Map<string, number>();
const GUEST_CALL_COOLDOWN_MS = 8000;

function clientIp(socket: Socket): string {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return socket.handshake.address || "unknown";
}

export function attachStaffNotificationsSocket(httpServer: HttpServer): SocketIOServer {
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
        if (decoded.role !== "staff") {
          reply({ ok: false, error: "NOT_STAFF" });
          return;
        }

        const pool = await getPool();
        const r = await pool
          .request()
          .input("id", sql.Int, decoded.userId)
          .query(
            `SELECT menuId, isActive FROM MenuStaff WHERE id = @id`
          );

        const row = r.recordset[0];
        if (!row || !row.isActive) {
          reply({ ok: false, error: "STAFF_NOT_FOUND" });
          return;
        }

        const menuId = row.menuId as number;
        await socket.join(roomForMenu(menuId));
        (socket.data as { staffMenuId?: number }).staffMenuId = menuId;
        reply({ ok: true, menuId });
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
          if (!Number.isFinite(menuId) || menuId <= 0 || !tableNumber) {
            reply({ ok: false, error: "INVALID_PAYLOAD" });
            return;
          }

          const safeTable = tableNumber.slice(0, 50);
          const ip = clientIp(socket);
          const key = `${ip}:${menuId}`;
          const now = Date.now();
          const last = lastGuestCall.get(key);
          if (last !== undefined && now - last < GUEST_CALL_COOLDOWN_MS) {
            reply({ ok: false, error: "RATE_LIMIT" });
            return;
          }
          lastGuestCall.set(key, now);

          const pool = await getPool();
          const menuCheck = await pool
            .request()
            .input("id", sql.Int, menuId)
            .query(`SELECT id, isActive FROM Menus WHERE id = @id`);

          const m = menuCheck.recordset[0];
          if (!m || !m.isActive) {
            reply({ ok: false, error: "MENU_NOT_FOUND" });
            return;
          }

          const tablesCount = await pool
            .request()
            .input("menuId", sql.Int, menuId)
            .query(
              `SELECT COUNT(*) as c FROM MenuTables WHERE menuId = @menuId`
            );
          const hasTables = Number(tablesCount.recordset[0]?.c) > 0;
          if (hasTables) {
            const match = await pool
              .request()
              .input("menuId", sql.Int, menuId)
              .input("tableNumber", sql.NVarChar, safeTable)
              .query(
                `SELECT id FROM MenuTables WHERE menuId = @menuId AND tableNumber = @tableNumber AND isActive = 1`
              );
            if (match.recordset.length === 0) {
              reply({ ok: false, error: "INVALID_TABLE" });
              return;
            }
          }

          io.to(roomForMenu(menuId)).emit("staff:table_call", {
            menuId,
            tableNumber: safeTable,
            at: new Date().toISOString(),
          });
          reply({ ok: true });
        } catch (e) {
          logger.error("guest:call_staff error:", e);
          reply({ ok: false, error: "SERVER_ERROR" });
        }
      }
    );
  });

  return io;
}
