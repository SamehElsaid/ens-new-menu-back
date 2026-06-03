import { getPool } from "../config/database";

/** Adds optional restaurantName to Users when missing (idempotent). */
export async function ensureRestaurantNameSchema(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF COL_LENGTH('Users', 'restaurantName') IS NULL
    BEGIN
      ALTER TABLE Users ADD restaurantName NVARCHAR(255) NULL;
    END
  `);
}
