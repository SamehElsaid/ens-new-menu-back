import { getPool, sql } from "../config/database";
import { DEPRECATED_MENU_THEMES } from "../constants/menuThemes";
import { logger } from "../utils/logger";

/** One-time idempotent data fix: retired themes → default. */
export async function migrateDeprecatedMenuThemes(): Promise<void> {
  if (DEPRECATED_MENU_THEMES.length === 0) {
    return;
  }

  const pool = await getPool();
  const request = pool.request();

  const placeholders = DEPRECATED_MENU_THEMES.map((theme, index) => {
    const param = `deprecatedTheme${index}`;
    request.input(param, sql.NVarChar, theme);
    return `@${param}`;
  }).join(", ");

  const result = await request.query(`
    UPDATE dbo.Menus
    SET theme = 'default', updatedAt = GETDATE()
    WHERE theme IN (${placeholders})
  `);

  const rowsAffected = result.rowsAffected[0] ?? 0;
  if (rowsAffected > 0) {
    logger.info(
      `Migrated ${rowsAffected} menu(s) from deprecated themes to default`,
    );
  }
}
