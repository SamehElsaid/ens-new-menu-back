import { Request, Response, NextFunction } from "express";
import { decryptDataApi } from "../utils/decrypt";
import { logger } from "../utils/logger";

require('dotenv').config();

/**
 * List of public routes that don't require API key
 */
const publicRoutes = [
    '/health',
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/check-availability',
    '/api/auth/verify-email',
    '/api/auth/resend-verification',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/refresh',
    '/api/public',
];

/**
 * Check if the current route is a public route
 */
function isPublicRoute(path: string): boolean {
    return publicRoutes.some(route => path.startsWith(route));
}

/**
 * Middleware to decrypt x-api-key header if present
 * Decrypts the API key using ENCRYPTION_KEY from environment variables
 * Logs the decrypted data for debugging
 * Skips validation for public routes (login, signup, etc.)
 */
export function decryptApiKey(req: Request, res: Response, next: NextFunction) {
    // Skip API key validation for public routes
    if (isPublicRoute(req.path)) {
        return next();
    }

    const apiKey = req.headers["x-api-key"] as string | undefined;

    // Require x-api-key header
    if (!apiKey) {
        logger.error("❌ Missing x-api-key header:", {
            path: req.path,
            method: req.method,
        });
        return res.status(401).json({ error: "No token provided", message: "No token provided" });
    }

    // If x-api-key is present, decrypt it
    if (apiKey) {
        const encryptionKey = process.env.ENCRYPTION_KEY;

        // console.log("encryptionKey", encryptionKey);

        if (!encryptionKey) {
            logger.warn("x-api-key header present but ENCRYPTION_KEY not configured");
            return next();
        }

        try {
            const decryptedData = decryptDataApi(apiKey, encryptionKey);
            const match = decryptedData.match(/\/\/\/([\d.]+)/);

            if (!match) {
                logger.error("❌ Invalid token format:", {
                    path: req.path,
                    method: req.method,
                });
                return res.status(401).json({ error: "Invalid token format" });
            }

            const sentTimestamp = parseFloat(match[1]);
            const currentTimestamp = Date.now() / 1000;

            if (Math.abs(currentTimestamp - sentTimestamp) > 60) {
                logger.error("❌ Token expired:", {
                    path: req.path,
                    method: req.method,
                    timeDifference: Math.abs(currentTimestamp - sentTimestamp),
                });
                return res.status(405).json({ error: "Token expired" });
            }
            // console.log(apiKey, "decryptedData", encryptionKey);


            // Attach decrypted data to request object for potential use in controllers
            (req as any).decryptedApiKey = decryptedData;
        } catch (error) {
            logger.error("❌ Failed to decrypt x-api-key:", {
                error: error instanceof Error ? error.message : String(error),
                path: req.path,
                method: req.method,
            });
            return res.status(401).json({ 
                error: "Failed to decrypt or validate API key",
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    next();
}

