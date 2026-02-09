// Load environment variables FIRST, before any other imports
// This must be the very first import in server.ts
import dotenv from "dotenv";
import { existsSync } from "fs";
import path from "path";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : process.env.NODE_ENV === "test"
    ? ".env.test"
    : ".env.development";

const envPath = path.resolve(process.cwd(), envFile);

// Try to load from file if it exists
if (existsSync(envPath)) {
  const result = dotenv.config({ path: envFile });

  if (result.error) {
    console.error(`❌ Failed to load ${envFile}:`, result.error);
  } else {
    console.log(`✅ Loaded environment from: ${envFile}`);
  }
} else {
  console.log(
    `ℹ️  No ${envFile} file found, using system environment variables`
  );
}

// Verify critical environment variables are present
const requiredVars = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "JWT_SECRET"];
const missing = requiredVars.filter((v) => !process.env[v]);

if (missing.length > 0) {
  console.error(
    `❌ Missing required environment variables: ${missing.join(", ")}`
  );
  process.exit(1);
}

console.log(`✅ Environment ready:`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || "development"}`);
console.log(`   DB_HOST: ${process.env.DB_HOST}`);
console.log(`   DB_PORT: ${process.env.DB_PORT}`);
console.log(`   DB_NAME: ${process.env.DB_NAME}`);
console.log(`   DB_USER: ${process.env.DB_USER}`);
console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? "✅ Set" : "⚠️ Not set"}`);
console.log(`   SECRET_KEY: ${process.env.SECRET_KEY ? "✅ Set" : "⚠️ Not set"}`);

// Export for potential use
export default process.env;
