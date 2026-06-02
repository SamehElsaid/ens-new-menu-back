import { Request } from "express";
import { logger } from "./logger";

function normalizeIp(raw: string): string {
  const ip = raw.trim().replace("::ffff:", "");
  if (ip.startsWith("[") && ip.endsWith("]")) {
    return ip.slice(1, -1);
  }
  return ip;
}

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip || ip === "unknown") return true;
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return false;
}

/** End-user IP for third-party APIs (VerifyKit requires X-Vfk-Forwarded-For). */
export function getClientIp(req: Request): string {
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    const ip = normalizeIp(realIp);
    if (isPrivateOrLocalIp(ip)) {
      logger.warn("VerifyKit: x-real-ip is private/local", { ip });
    }
    return ip;
  }

  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const ip = normalizeIp(forwarded.split(",")[0]);
    if (isPrivateOrLocalIp(ip)) {
      logger.warn("VerifyKit: x-forwarded-for is private/local", { ip });
    }
    return ip;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return normalizeIp(String(forwarded[0]));
  }

  const ip = normalizeIp(
    req.ip || req.socket.remoteAddress || "unknown",
  );
  if (isPrivateOrLocalIp(ip)) {
    logger.warn("VerifyKit: resolved client IP is private/local", { ip });
  }
  return ip;
}
