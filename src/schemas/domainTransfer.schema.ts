import { getPool } from "../config/database";
import { logger } from "../utils/logger";

/** Idempotent schema for domain transfer requests workflow. */
export async function ensureDomainTransferSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.DomainTransferRequests', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.DomainTransferRequests (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DomainTransferRequests PRIMARY KEY,
        userId INT NOT NULL,
        domainUrl NVARCHAR(500) NOT NULL,
        status NVARCHAR(50) NOT NULL CONSTRAINT DF_DomainTransferRequests_status DEFAULT N'pending',
        userConfirmedAt DATETIME2 NULL,
        completedAt DATETIME2 NULL,
        completedByAdminId INT NULL,
        completedByAdminName NVARCHAR(255) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_DomainTransferRequests_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_DomainTransferRequests_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_DomainTransferRequests_status CHECK (
          status IN (N'pending', N'awaiting_user', N'user_confirmed', N'completed', N'cancelled')
        )
      );
      CREATE INDEX IX_DomainTransferRequests_userId ON dbo.DomainTransferRequests (userId, createdAt DESC);
      CREATE INDEX IX_DomainTransferRequests_status ON dbo.DomainTransferRequests (status, createdAt DESC);
    END
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'dbo.DomainTransferMessages', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.DomainTransferMessages (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DomainTransferMessages PRIMARY KEY,
        requestId INT NOT NULL,
        senderType NVARCHAR(20) NOT NULL,
        message NVARCHAR(MAX) NOT NULL,
        adminId INT NULL,
        adminName NVARCHAR(255) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_DomainTransferMessages_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_DomainTransferMessages_senderType CHECK (
          senderType IN (N'admin', N'user')
        )
      );
      CREATE INDEX IX_DomainTransferMessages_requestId ON dbo.DomainTransferMessages (requestId, createdAt ASC);
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH(N'dbo.DomainTransferRequests', N'cancelledAt') IS NULL
      ALTER TABLE dbo.DomainTransferRequests ADD cancelledAt DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.DomainTransferRequests', N'cancelledBy') IS NULL
      ALTER TABLE dbo.DomainTransferRequests ADD cancelledBy NVARCHAR(20) NULL;
  `);

  await pool.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.check_constraints
      WHERE name = N'CK_DomainTransferRequests_status'
        AND parent_object_id = OBJECT_ID(N'dbo.DomainTransferRequests')
    )
    BEGIN
      ALTER TABLE dbo.DomainTransferRequests DROP CONSTRAINT CK_DomainTransferRequests_status;
      ALTER TABLE dbo.DomainTransferRequests ADD CONSTRAINT CK_DomainTransferRequests_status CHECK (
        status IN (N'pending', N'awaiting_user', N'user_confirmed', N'completed', N'cancelled')
      );
    END
  `);

  logger.info("Domain transfer schema ensured");
}
