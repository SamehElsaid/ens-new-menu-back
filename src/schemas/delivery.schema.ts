import { getPool } from "../config/database";

/** Adds delivery fields on Users and UserDeliveryGovernorates table (idempotent). */
export async function ensureDeliverySchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('Users', 'deliveryOn') IS NULL
    BEGIN
      ALTER TABLE Users ADD deliveryOn BIT NOT NULL CONSTRAINT DF_Users_deliveryOn DEFAULT 0;
    END

    IF COL_LENGTH('Users', 'deliveryPhone') IS NULL
    BEGIN
      ALTER TABLE Users ADD deliveryPhone NVARCHAR(50) NULL;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'UserDeliveryGovernorates'
    )
    BEGIN
      CREATE TABLE UserDeliveryGovernorates (
        id INT IDENTITY(1,1) PRIMARY KEY,
        userId INT NOT NULL,
        nameAr NVARCHAR(255) NOT NULL,
        nameEn NVARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL CONSTRAINT DF_UserDeliveryGovernorates_price DEFAULT 0,
        lat DECIMAL(10, 8) NULL,
        lan DECIMAL(11, 8) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_UserDeliveryGovernorates_createdAt DEFAULT GETDATE(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_UserDeliveryGovernorates_updatedAt DEFAULT GETDATE(),
        CONSTRAINT FK_UserDeliveryGovernorates_Users
          FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
      );

      CREATE INDEX IX_UserDeliveryGovernorates_userId
        ON UserDeliveryGovernorates(userId);
    END

    IF COL_LENGTH('UserDeliveryGovernorates', 'lat') IS NULL
    BEGIN
      ALTER TABLE UserDeliveryGovernorates ADD lat DECIMAL(10, 8) NULL;
    END

    IF COL_LENGTH('UserDeliveryGovernorates', 'lan') IS NULL
    BEGIN
      ALTER TABLE UserDeliveryGovernorates ADD lan DECIMAL(11, 8) NULL;
    END
  `);
}
