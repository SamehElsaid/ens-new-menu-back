import { getPool } from "../config/database";
import { logger } from "../utils/logger";

async function ensureBillingCycleColumn(): Promise<void> {
  const pool = await getPool();

  const colResult = await pool.request().query(`
    SELECT COL_LENGTH('dbo.Vouchers', 'billing_cycle') AS colLen
  `);
  if (colResult.recordset[0]?.colLen != null) {
    return;
  }

  await pool.request().query(`
    ALTER TABLE dbo.Vouchers
      ADD billing_cycle NVARCHAR(20) NULL CONSTRAINT DF_Vouchers_billing_cycle DEFAULT N'both';
  `);

  const ckResult = await pool.request().query(`
    SELECT 1 AS found
    FROM sys.check_constraints
    WHERE name = N'CK_Vouchers_billing_cycle'
      AND parent_object_id = OBJECT_ID(N'dbo.Vouchers')
  `);
  if (ckResult.recordset.length === 0) {
    await pool.request().query(`
      ALTER TABLE dbo.Vouchers
        ADD CONSTRAINT CK_Vouchers_billing_cycle CHECK (
          billing_cycle IS NULL OR billing_cycle IN (N'monthly', N'yearly', N'both')
        );
    `);
  }

  await pool.request().query(`
    UPDATE dbo.Vouchers
    SET billing_cycle = N'both'
    WHERE type = N'discount' AND billing_cycle IS NULL;
  `);

  logger.info("Vouchers.billing_cycle column added");
}

export async function ensureVoucherSchema(): Promise<void> {
  const pool = await getPool();

  const tableResult = await pool.request().query(`
    SELECT OBJECT_ID(N'dbo.Vouchers', N'U') AS tableId
  `);

  if (tableResult.recordset[0]?.tableId) {
    await ensureBillingCycleColumn();
    return;
  }

  await pool.request().query(`
    CREATE TABLE dbo.Vouchers (
      id INT IDENTITY(1,1) NOT NULL,
      code NVARCHAR(50) NOT NULL,
      type NVARCHAR(20) NOT NULL,
      discount_type NVARCHAR(20) NULL,
      discount_value DECIMAL(12, 2) NULL,
      duration_unit NVARCHAR(20) NULL,
      duration_value INT NULL,
      billing_cycle NVARCHAR(20) NULL CONSTRAINT DF_Vouchers_billing_cycle DEFAULT N'both',
      max_uses INT NOT NULL CONSTRAINT DF_Vouchers_max_uses DEFAULT 1,
      used_count INT NOT NULL CONSTRAINT DF_Vouchers_used_count DEFAULT 0,
      is_active BIT NOT NULL CONSTRAINT DF_Vouchers_is_active DEFAULT 1,
      valid_from DATETIME2 NULL,
      valid_until DATETIME2 NULL,
      description NVARCHAR(500) NULL,
      created_at DATETIME2 NOT NULL CONSTRAINT DF_Vouchers_created DEFAULT SYSUTCDATETIME(),
      updated_at DATETIME2 NOT NULL CONSTRAINT DF_Vouchers_updated DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_Vouchers PRIMARY KEY (id),
      CONSTRAINT UQ_Vouchers_code UNIQUE (code),
      CONSTRAINT CK_Vouchers_type CHECK (type IN (N'discount', N'duration')),
      CONSTRAINT CK_Vouchers_discount_type CHECK (
        discount_type IS NULL OR discount_type IN (N'percentage', N'fixed')
      ),
      CONSTRAINT CK_Vouchers_duration_unit CHECK (
        duration_unit IS NULL OR duration_unit IN (N'days', N'months')
      ),
      CONSTRAINT CK_Vouchers_billing_cycle CHECK (
        billing_cycle IS NULL OR billing_cycle IN (N'monthly', N'yearly', N'both')
      )
    );
    CREATE INDEX IX_Vouchers_code ON dbo.Vouchers (code);
    CREATE INDEX IX_Vouchers_is_active ON dbo.Vouchers (is_active);
  `);

  await pool.request().query(`
    CREATE TABLE dbo.VoucherRedemptions (
      id INT IDENTITY(1,1) NOT NULL,
      voucher_id INT NOT NULL,
      user_id INT NOT NULL,
      order_id UNIQUEIDENTIFIER NULL,
      subscription_id INT NULL,
      redeemed_at DATETIME2 NOT NULL CONSTRAINT DF_VoucherRedemptions_redeemed DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_VoucherRedemptions PRIMARY KEY (id),
      CONSTRAINT UQ_VoucherRedemptions_user_voucher UNIQUE (voucher_id, user_id),
      CONSTRAINT FK_VoucherRedemptions_Vouchers
        FOREIGN KEY (voucher_id) REFERENCES dbo.Vouchers (id)
    );
    CREATE INDEX IX_VoucherRedemptions_voucher_id ON dbo.VoucherRedemptions (voucher_id);
    CREATE INDEX IX_VoucherRedemptions_user_id ON dbo.VoucherRedemptions (user_id);
  `);

  logger.info("Vouchers tables created");
}
