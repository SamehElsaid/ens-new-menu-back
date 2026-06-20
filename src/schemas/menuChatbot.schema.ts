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

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.default_constraints
      WHERE parent_object_id = OBJECT_ID(N'dbo.Menus')
        AND name = N'DF_Menus_chatbotEnabled'
    )
    AND COL_LENGTH('dbo.Menus', 'chatbotEnabled') IS NOT NULL
    BEGIN
      ALTER TABLE dbo.Menus
        ADD CONSTRAINT DF_Menus_chatbotEnabled DEFAULT 1 FOR chatbotEnabled;
    END
  `);
}
