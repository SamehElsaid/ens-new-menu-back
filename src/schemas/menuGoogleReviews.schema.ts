import { getPool } from "../config/database";

/** Adds Google Reviews CTA columns on Menus (idempotent). */
export async function ensureMenuGoogleReviewsSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'googleReviewsEnabled') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus
        ADD googleReviewsEnabled BIT NOT NULL
        CONSTRAINT DF_Menus_googleReviewsEnabled DEFAULT 0;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'googleReviewsUrl') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus ADD googleReviewsUrl NVARCHAR(500) NULL;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'googleReviewsPosition') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus
        ADD googleReviewsPosition NVARCHAR(32) NOT NULL
        CONSTRAINT DF_Menus_googleReviewsPosition DEFAULT N'bottom';
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'googleReviewsButtonTextAr') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus ADD googleReviewsButtonTextAr NVARCHAR(200) NULL;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'googleReviewsButtonTextEn') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus ADD googleReviewsButtonTextEn NVARCHAR(200) NULL;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'googleReviewsShowIcon') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus
        ADD googleReviewsShowIcon BIT NOT NULL
        CONSTRAINT DF_Menus_googleReviewsShowIcon DEFAULT 1;
    END
  `);

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'googleReviewsOpenInNewTab') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus
        ADD googleReviewsOpenInNewTab BIT NOT NULL
        CONSTRAINT DF_Menus_googleReviewsOpenInNewTab DEFAULT 1;
    END
  `);
}
