import { getPool } from "../config/database";
import { logger } from "../utils/logger";

/** Idempotent schema for admin customer CRM (addresses, notes, activity, support). */
export async function ensureAdminCustomerSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH(N'dbo.Users', N'isBlocked') IS NULL
      ALTER TABLE dbo.Users ADD isBlocked BIT NOT NULL CONSTRAINT DF_Users_isBlocked DEFAULT 0;
    IF COL_LENGTH(N'dbo.Users', N'blockedAt') IS NULL
      ALTER TABLE dbo.Users ADD blockedAt DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.Users', N'blockedReason') IS NULL
      ALTER TABLE dbo.Users ADD blockedReason NVARCHAR(500) NULL;
    IF COL_LENGTH(N'dbo.Users', N'deletedAt') IS NULL
      ALTER TABLE dbo.Users ADD deletedAt DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.Users', N'updatedAt') IS NULL
      ALTER TABLE dbo.Users ADD updatedAt DATETIME2 NULL;
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.UserAddresses', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.UserAddresses (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserAddresses PRIMARY KEY,
        userId INT NOT NULL,
        label NVARCHAR(100) NULL,
        addressLine NVARCHAR(500) NOT NULL,
        city NVARCHAR(100) NULL,
        governorate NVARCHAR(100) NULL,
        country NVARCHAR(100) NULL,
        postalCode NVARCHAR(20) NULL,
        isDefault BIT NOT NULL CONSTRAINT DF_UserAddresses_isDefault DEFAULT 0,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_UserAddresses_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserAddresses_updatedAt DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_UserAddresses_userId ON dbo.UserAddresses (userId);
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.UserInternalNotes', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.UserInternalNotes (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserInternalNotes PRIMARY KEY,
        userId INT NOT NULL,
        adminId INT NULL,
        adminName NVARCHAR(255) NOT NULL,
        note NVARCHAR(MAX) NOT NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_UserInternalNotes_createdAt DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_UserInternalNotes_userId ON dbo.UserInternalNotes (userId, createdAt DESC);
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.UserAdminActivityLog', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.UserAdminActivityLog (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserAdminActivityLog PRIMARY KEY,
        userId INT NOT NULL,
        adminId INT NULL,
        adminName NVARCHAR(255) NOT NULL,
        action NVARCHAR(100) NOT NULL,
        details NVARCHAR(MAX) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_UserAdminActivityLog_createdAt DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_UserAdminActivityLog_userId ON dbo.UserAdminActivityLog (userId, createdAt DESC);
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.UserSupportCases', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.UserSupportCases (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserSupportCases PRIMARY KEY,
        userId INT NOT NULL,
        subject NVARCHAR(255) NOT NULL,
        message NVARCHAR(MAX) NOT NULL,
        status NVARCHAR(50) NOT NULL CONSTRAINT DF_UserSupportCases_status DEFAULT N'open',
        ticketRef NVARCHAR(100) NULL,
        adminId INT NULL,
        adminName NVARCHAR(255) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_UserSupportCases_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserSupportCases_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_UserSupportCases_status CHECK (
          status IN (N'open', N'in_progress', N'resolved', N'closed')
        )
      );
      CREATE INDEX IX_UserSupportCases_userId ON dbo.UserSupportCases (userId, createdAt DESC);
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.UserBlockedVouchers', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.UserBlockedVouchers (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserBlockedVouchers PRIMARY KEY,
        userId INT NOT NULL,
        voucherId INT NOT NULL,
        blockedByAdminId INT NULL,
        blockedAt DATETIME2 NOT NULL CONSTRAINT DF_UserBlockedVouchers_blockedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_UserBlockedVouchers_user_voucher UNIQUE (userId, voucherId)
      );
      CREATE INDEX IX_UserBlockedVouchers_userId ON dbo.UserBlockedVouchers (userId);
    END
  `);

  logger.info("Admin customer CRM schema ensured");
}
