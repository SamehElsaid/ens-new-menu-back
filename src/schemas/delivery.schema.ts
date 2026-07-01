import { getPool } from "../config/database";

/** Adds delivery fields on Users, UserDeliveryGovernorates, and per-menu delivery (idempotent). */
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

    IF COL_LENGTH('Users', 'deliveryWhatsAppOn') IS NULL
    BEGIN
      ALTER TABLE Users ADD deliveryWhatsAppOn BIT NOT NULL
        CONSTRAINT DF_Users_deliveryWhatsAppOn DEFAULT 1;
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

  await pool.request().query(`
    IF COL_LENGTH('Menus', 'deliveryOn') IS NULL
    BEGIN
      ALTER TABLE Menus ADD deliveryOn BIT NOT NULL
        CONSTRAINT DF_Menus_deliveryOn DEFAULT 0;
    END

    IF COL_LENGTH('Menus', 'deliveryPhone') IS NULL
    BEGIN
      ALTER TABLE Menus ADD deliveryPhone NVARCHAR(50) NULL;
    END

    IF COL_LENGTH('Menus', 'deliveryWhatsAppOn') IS NULL
    BEGIN
      ALTER TABLE Menus ADD deliveryWhatsAppOn BIT NOT NULL
        CONSTRAINT DF_Menus_deliveryWhatsAppOn DEFAULT 1;
    END

    IF COL_LENGTH('Menus', 'deliveryLegacyUserSeedDone') IS NULL
    BEGIN
      ALTER TABLE Menus ADD deliveryLegacyUserSeedDone BIT NOT NULL
        CONSTRAINT DF_Menus_deliveryLegacyUserSeedDone DEFAULT 0;
    END
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'MenuDeliveryGovernorates'
    )
    BEGIN
      CREATE TABLE MenuDeliveryGovernorates (
        id INT IDENTITY(1,1) PRIMARY KEY,
        menuId INT NOT NULL,
        nameAr NVARCHAR(255) NOT NULL,
        nameEn NVARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL CONSTRAINT DF_MenuDeliveryGovernorates_price DEFAULT 0,
        lat DECIMAL(10, 8) NULL,
        lan DECIMAL(11, 8) NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_MenuDeliveryGovernorates_createdAt DEFAULT GETDATE(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_MenuDeliveryGovernorates_updatedAt DEFAULT GETDATE(),
        CONSTRAINT FK_MenuDeliveryGovernorates_Menus
          FOREIGN KEY (menuId) REFERENCES Menus(id) ON DELETE CASCADE
      );

      CREATE INDEX IX_MenuDeliveryGovernorates_menuId
        ON MenuDeliveryGovernorates(menuId);
    END
  `);

  await migrateUserDeliveryDataToMenus(pool);
}

async function migrateUserDeliveryDataToMenus(
  pool: Awaited<ReturnType<typeof getPool>>,
): Promise<void> {
  // Menus that already have per-menu zones were configured explicitly — never re-seed.
  await pool.request().query(`
    UPDATE m
    SET deliveryLegacyUserSeedDone = 1
    FROM Menus m
    WHERE ISNULL(m.deliveryLegacyUserSeedDone, 0) = 0
      AND EXISTS (
        SELECT 1 FROM MenuDeliveryGovernorates g WHERE g.menuId = m.id
      )
  `);

  await pool.request().query(`
    UPDATE m
    SET
      deliveryOn = ISNULL(u.deliveryOn, 0),
      deliveryPhone = COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(m.deliveryPhone, N''))), N''), u.deliveryPhone),
      deliveryWhatsAppOn = ISNULL(u.deliveryWhatsAppOn, 1)
    FROM Menus m
    INNER JOIN Users u ON u.id = m.userId
    WHERE ISNULL(m.deliveryLegacyUserSeedDone, 0) = 0
  `);

  await pool.request().query(`
    INSERT INTO MenuDeliveryGovernorates (menuId, nameAr, nameEn, price, lat, lan, createdAt, updatedAt)
    SELECT m.id, ug.nameAr, ug.nameEn, ug.price, ug.lat, ug.lan, ug.createdAt, ug.updatedAt
    FROM Menus m
    INNER JOIN UserDeliveryGovernorates ug ON ug.userId = m.userId
    WHERE ISNULL(m.deliveryLegacyUserSeedDone, 0) = 0
  `);

  await pool.request().query(`
    UPDATE Menus
    SET deliveryLegacyUserSeedDone = 1
    WHERE ISNULL(deliveryLegacyUserSeedDone, 0) = 0
  `);
}
