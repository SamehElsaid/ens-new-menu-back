import { Request } from "express";
import { TokenPayload } from "../utils/tokenHelper";

/**
 * `req.user` is set by `optionalAuth` / `requireAuth` (see `auth.middleware.ts`).
 */
export type AuthRequest = Request & { user?: TokenPayload };
