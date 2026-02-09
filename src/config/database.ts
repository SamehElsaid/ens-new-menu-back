import sql from "mssql";
import { logger } from "../utils/logger";

// Debug environment variables
logger.debug("Database config:", {
  server: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  hasPassword: !!process.env.DB_PASSWORD,
});

const config: sql.config = {
  server: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT || "1433"),
  database: process.env.DB_NAME!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    try {
      pool = await new sql.ConnectionPool(config).connect();
      logger.info("✅ Database connected successfully");

      // Handle connection errors
      pool.on("error", (err: Error) => {
        logger.error("Database pool error:", err);
        pool = null;
      });
    } catch (error) {
      logger.error("❌ Database connection failed:", error);
      throw error;
    }
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    logger.info("Database connection closed");
  }
}

// Helper function for transactions
export async function executeTransaction<T>(
  callback: (transaction: sql.Transaction) => Promise<T>
): Promise<T> {
  const poolInstance = await getPool();
  const transaction = new sql.Transaction(poolInstance);

  try {
    await transaction.begin();
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export { sql };
