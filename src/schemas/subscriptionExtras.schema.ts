import { getPool } from "../config/database";
import { logger } from "../utils/logger";

/** Idempotent schema for Pro extra menu add-ons on subscriptions. */
export async function ensureSubscriptionExtrasSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH(N'dbo.Subscriptions', N'extraMenus') IS NULL
      ALTER TABLE dbo.Subscriptions ADD extraMenus INT NOT NULL
        CONSTRAINT DF_Subscriptions_extraMenus DEFAULT 0;
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.ExtraMenuPurchases', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ExtraMenuPurchases (
        paymentId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ExtraMenuPurchases PRIMARY KEY,
        userId INT NOT NULL,
        subscriptionId INT NOT NULL,
        quantity INT NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_ExtraMenuPurchases_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_ExtraMenuPurchases_quantity CHECK (quantity > 0)
      );
      CREATE INDEX IX_ExtraMenuPurchases_userId ON dbo.ExtraMenuPurchases (userId, createdAt DESC);
    END
  `);

  logger.info("Subscription extras schema ensured");
}
