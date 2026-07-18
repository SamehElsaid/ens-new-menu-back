import { getPool } from "../config/database";

/** Adds optional WiFi / tax / service charge columns on Menus (idempotent). */
export async function ensureMenuWifiTaxServiceSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'wifiEnabled') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus
        ADD wifiEnabled BIT NOT NULL
        CONSTRAINT DF_Menus_wifiEnabled DEFAULT 0;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'wifiName') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus ADD wifiName NVARCHAR(255) NULL;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'wifiPassword') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus ADD wifiPassword NVARCHAR(255) NULL;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'taxEnabled') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus
        ADD taxEnabled BIT NOT NULL
        CONSTRAINT DF_Menus_taxEnabled DEFAULT 0;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'taxPercent') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus ADD taxPercent DECIMAL(5,2) NULL;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'serviceEnabled') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus
        ADD serviceEnabled BIT NOT NULL
        CONSTRAINT DF_Menus_serviceEnabled DEFAULT 0;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'servicePercent') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus ADD servicePercent DECIMAL(5,2) NULL;
    END
  `);
}
