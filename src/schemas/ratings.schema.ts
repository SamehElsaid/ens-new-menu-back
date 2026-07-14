import { getPool } from "../config/database";

/** Adds optional contact fields on Ratings (idempotent). */
export async function ensureRatingsSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('Ratings', 'customerPhone') IS NULL
    BEGIN
      ALTER TABLE Ratings ADD customerPhone NVARCHAR(50) NULL;
    END

    IF COL_LENGTH('Ratings', 'customerEmail') IS NULL
    BEGIN
      ALTER TABLE Ratings ADD customerEmail NVARCHAR(255) NULL;
    END
  `);
}
