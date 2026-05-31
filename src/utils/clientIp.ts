import { Request } from "express";

/** End-user IP for third-party APIs (VerifyKit requires X-Vfk-Forwarded-For). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim().replace("::ffff:", "");
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).trim().replace("::ffff:", "");
  }
  return (req.ip || req.socket.remoteAddress || "unknown").replace(
    "::ffff:",
    "",
  );
}
