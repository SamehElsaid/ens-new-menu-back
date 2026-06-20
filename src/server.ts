// MUST be imported first to load environment variables
import "./env";

import express, { Application, Request, Response, NextFunction } from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import path from "path";

import { corsOriginDelegate } from "./config/corsOrigins";
import { attachStaffNotificationsSocket } from "./socket/staffNotifications.socket";
import { setStaffNotificationsIo } from "./socket/staffIoBroadcast";

import { getPool, closePool } from "./config/database";
import { testEmailConnection } from "./config/email";
import { logger } from "./utils/logger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { decryptApiKey } from "./middleware/apiKey.middleware";
import { validateJWTSecrets } from "./utils/tokenHelper";
import { CleanupService } from "./services/cleanup.service";
import { ensureUploadDirectories } from "./controllers/upload.controller";
import { ensureDatabaseSchemas } from "./schemas";
import { startSubscriptionScheduler } from "./services/subscriptionNotificationService";
// Routes
import authRoutes from "./routes/auth.routes";
import googleAuthRoutes from "./routes/google-auth.routes";
import verifykitRoutes from "./routes/verifykit.routes";
import publicRoutes from "./routes/public.routes";
import menuRoutes from "./routes/menu.routes";
import categoryRoutes from "./routes/category.routes";
import userRoutes from "./routes/user.routes";
import adminRoutes from "./routes/admin.routes";
import uploadRoutes from "./routes/upload.routes";
import structureRoutes from "./routes/structure.routes";
import adsRoutes from "./routes/ads.routes";
import staffAuthRoutes from "./routes/staffAuth.routes";
import paymentRoutes from "./routes/paymentRoutes";
import voucherRoutes from "./routes/voucher.routes";
import { getPublicAppVersion } from "./controllers/version.controller";
import {
  getPromoHandler,
  postPromoHandler,
} from "./controllers/promo.controller";
import {
  getSearchInformationHandler,
  getSearchInformationByIdHandler,
  postSearchInformationHandler,
  putSearchInformationHandler,
  deleteSearchInformationHandler,
} from "./controllers/searchInformation.controller";
import { requireAdmin } from "./middleware/auth.middleware";

// ------------------------------------------------------------------

logger.debug("Environment check after loading:", {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DB_HOST: process.env.DB_HOST,
  DB_NAME: process.env.DB_NAME,
});

// Validate JWT secrets
validateJWTSecrets();

const app: Application = express();
const PORT = Number(process.env.PORT) || 4021;

// ------------------------------------------------------------------
// ✅ Trust proxy (REQUIRED for Cloudflare & Coolify)
app.set("trust proxy", 1);
app.set("etag", false);

// ------------------------------------------------------------------
// Security headers
// Allow dashboard/menu frontends on another origin (port/host) to load /uploads in <img>, canvas, etc.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// ------------------------------------------------------------------
// ✅ HTTPS FIX (Cloudflare / SSL 526 / redirect loop fix)
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") return next();

  const proto = req.headers["x-forwarded-proto"];

  // Allow internal calls (health checks, curl, docker)
  if (!proto) return next();

  if (proto !== "https") {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }

  next();
});

// ------------------------------------------------------------------
// ✅ CORS (subdomains + curl + frontend safe)
app.use(
  cors({
    origin: corsOriginDelegate,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-key",
      "Accept-Language",
    ],
  }),
);

// ------------------------------------------------------------------
// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ------------------------------------------------------------------
// Static uploads (public, no x-api-key — must stay before decryptApiKey)
const uploadsCors = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
};
const uploadsStatic = express.static(path.join(__dirname, "../uploads"));

const uploadsNotFound = (_req: Request, res: Response) => {
  res.status(404).json({ error: "Upload not found" });
};

app.use("/uploads", uploadsCors, uploadsStatic, uploadsNotFound);
// Backward compat: URLs built as API_URL + "/uploads/..." when API_URL wrongly included "/api"
app.use("/api/uploads", uploadsCors, uploadsStatic, uploadsNotFound);

// ------------------------------------------------------------------
// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

// ------------------------------------------------------------------
// Health + fully public routes (no x-api-key / JWT — must be before decryptApiKey)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    build: "public-app-version-v2",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Mobile app version — fully open (no x-api-key, no JWT, no rate limit)

app.get("/api/public/app-version/latest", getPublicAppVersion);

// Promo — GET is public (no x-api-key)
app.get("/api/promo", getPromoHandler);

// Search information — GET list & GET by id are public (no x-api-key)
app.get("/api/searchInformation", getSearchInformationHandler);
app.get("/api/searchInformation/:id", getSearchInformationByIdHandler);

// Other public routes (menus, plans, …)
app.use("/api/public", publicRoutes);

// API key for all routes registered below (except isPublicRoute / isFullyOpenPath)
app.use(decryptApiKey);

// ------------------------------------------------------------------
// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/verifykit", verifykitRoutes);
app.use("/api/staff-auth", staffAuthRoutes);
// Backward-compatible alias for clients that accidentally prefix /api twice.
app.use("/api/api/staff-auth", staffAuthRoutes);
app.use("/api/menus", menuRoutes);
// Must be before app.use("/api", categoryRoutes): that router runs requireAuth on all /api/* paths
app.use("/api/payment", paymentRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api", categoryRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.post("/api/promo", requireAdmin, postPromoHandler);
app.post("/api/searchInformation", requireAdmin, postSearchInformationHandler);
app.put(
  "/api/searchInformation/:id",
  requireAdmin,
  putSearchInformationHandler,
);
app.delete(
  "/api/searchInformation/:id",
  requireAdmin,
  deleteSearchInformationHandler,
);
app.use("/api/upload", uploadRoutes);
app.use("/api/structure", structureRoutes);
app.use("/api", adsRoutes);
// ------------------------------------------------------------------
// 404 + Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// ------------------------------------------------------------------
// Server startup
async function startServer() {
  try {
    await ensureUploadDirectories();
    logger.info("✅ Upload directories initialized");

    try {
      await getPool();
      logger.info("✅ Database connected successfully");
      await ensureDatabaseSchemas();
    } catch (dbError) {
      logger.error("❌ Database connection failed:", dbError);
    }

    testEmailConnection().then((ok) => {
      if (ok) {
        logger.info("✅ Email (Resend) configured");
      } else {
        logger.warn("⚠️ Email disabled: set RESEND_API_KEY and EMAIL_FROM");
      }
    });

    CleanupService.start();
    startSubscriptionScheduler();

    const httpServer = http.createServer(app);
    const staffIo = attachStaffNotificationsSocket(httpServer);
    setStaffNotificationsIo(staffIo);

    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error("❌ Server failed to start:", err);
    process.exit(1);
  }
}

// ------------------------------------------------------------------
// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received");
  CleanupService.stop();
  await closePool();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received");
  CleanupService.stop();
  await closePool();
  process.exit(0);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});

// ------------------------------------------------------------------
startServer();

export default app;
