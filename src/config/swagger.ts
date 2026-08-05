import path from "path";
import fs from "fs";
import swaggerJsdoc from "swagger-jsdoc";
import { isSwaggerEnabled } from "../utils/devFlags";
import { enrichSwaggerSpec } from "./swaggerExamples";

function getSwaggerApiFiles(): string[] {
  const docsDir = path.resolve(process.cwd(), "src/docs/swagger");
  return fs
    .readdirSync(docsDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.join(docsDir, file));
}

function buildSwaggerOptions(): swaggerJsdoc.Options {
  return {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "EnsMenu API",
        version: "1.0.0",
        description:
          "Backend API for the EnsMenu platform — restaurant digital menus, subscriptions, and admin.",
        contact: { name: "EnsMenu" },
      },
      servers: [
        {
          url:
            process.env.API_URL ||
            `http://localhost:${process.env.PORT || 5000}`,
          description: "Development server",
        },
      ],
      tags: [
        { name: "Health", description: "Server health" },
        { name: "Auth", description: "User authentication" },
        { name: "Google Auth", description: "Google OAuth" },
        { name: "Apple Auth", description: "Sign in with Apple" },
        { name: "VerifyKit", description: "WhatsApp phone verification" },
        { name: "Staff Auth", description: "Menu staff login & table calls" },
        { name: "Public", description: "Public menu & landing endpoints" },
    { name: "Menus", description: "Menu CRUD & nested resources" },
    { name: "Delivery", description: "Delivery settings, governorates, branches & quotes" },
    { name: "Tables", description: "QR table codes for dine-in ordering (Pro)" },
    { name: "Orders", description: "Guest orders & staff table-call queue" },
    { name: "Staff", description: "Menu staff accounts for mobile app (Pro)" },
    { name: "Menu Groups", description: "Pro menu grouping" },
        { name: "Categories", description: "Menu categories & bulk import" },
        { name: "Ads", description: "Menu & global ads" },
        { name: "User", description: "Restaurant owner account — profile, subscription, notifications, domain transfer" },
        { name: "Payment", description: "EasyKash payments" },
        { name: "Vouchers", description: "Voucher validate & redeem" },
        { name: "Upload", description: "Image uploads" },
        { name: "Structure", description: "Structure image upload" },
        { name: "CMS", description: "Promo, search info, meta data" },
        { name: "Admin", description: "Platform admin panel — users, plans, vouchers, analytics, follow-ups (admin JWT required)" },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
            description:
              "Encrypted API key (skipped in dev when SKIP_API_KEY_CHECK=true)",
          },
          BearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "JWT access token from /api/auth/login",
          },
        },
        parameters: {
          menuId: {
            in: "path",
            name: "menuId",
            required: true,
            schema: { type: "integer", example: 42 },
            example: 42,
          },
          locale: {
            in: "query",
            name: "locale",
            schema: { type: "string", enum: ["ar", "en"], example: "ar" },
            example: "ar",
          },
        },
      },
      security: [{ ApiKeyAuth: [] }],
    },
    apis: getSwaggerApiFiles(),
  };
}

let cachedSpec: ReturnType<typeof swaggerJsdoc> | null = null;

/** Builds OpenAPI spec on first call; returns null outside development. */
export function getSwaggerSpec(): ReturnType<typeof swaggerJsdoc> | null {
  if (!isSwaggerEnabled()) return null;
  if (!cachedSpec) {
    cachedSpec = enrichSwaggerSpec(swaggerJsdoc(buildSwaggerOptions()));
  }
  return cachedSpec;
}
