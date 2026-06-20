import { getPool } from "../config/database";

/** Adds chatbotEnabled on Menus (idempotent). */
export async function ensureMenuChatbotSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('dbo.Menus', 'chatbotEnabled') IS NULL
    BEGIN
      ALTER TABLE dbo.Menus
        ADD chatbotEnabled BIT NOT NULL
        CONSTRAINT DF_Menus_chatbotEnabled DEFAULT 1;
    END
  `);
}
