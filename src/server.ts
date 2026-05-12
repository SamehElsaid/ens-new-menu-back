// MUST be imported first to load environment variables
import "./env";

import express, { Application } from "express";
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
import { validateJWTSecrets } from "./utils/tokenHelper";
import { CleanupService } from "./services/cleanup.service";
import { ensureUploadDirectories } from "./controllers/upload.controller";
import { startSubscriptionScheduler } from "./services/subscriptionNotificationService";
// Routes
import authRoutes from "./routes/auth.routes";
import googleAuthRoutes from "./routes/google-auth.routes";
import publicRoutes from "./routes/public.routes";
import menuRoutes from "./routes/menu.routes";
import menuItemsRoutes from "./routes/menuItems.routes";
import categoryRoutes from "./routes/category.routes";
import userRoutes from "./routes/user.routes";
import adminRoutes from "./routes/admin.routes";
import uploadRoutes from "./routes/upload.routes";
import adsRoutes from "./routes/ads.routes";
import staffAuthRoutes from "./routes/staffAuth.routes";
import paymentRoutes from "./routes/paymentRoutes";

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

// ------------------------------------------------------------------
// Security headers
app.use(helmet());

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
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  }),
);

// ------------------------------------------------------------------
// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ------------------------------------------------------------------
// Static uploads
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "../uploads")),
);

// ------------------------------------------------------------------
// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

// ------------------------------------------------------------------
// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ------------------------------------------------------------------
// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/staff-auth", staffAuthRoutes);
// Backward-compatible alias for clients that accidentally prefix /api twice.
app.use("/api/api/staff-auth", staffAuthRoutes);
app.use("/api/menus", menuRoutes);
app.use("/api/menus", menuItemsRoutes);
// Must be before app.use("/api", categoryRoutes): that router runs requireAuth on all /api/* paths
app.use("/api/payment", paymentRoutes);
app.use("/api", categoryRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
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
    } catch (dbError) {
      logger.error("❌ Database connection failed:", dbError);
    }

    testEmailConnection()
      .then(() => logger.info("✅ Email connection OK"))
      .catch(() => logger.warn("⚠️ Email disabled"));

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
