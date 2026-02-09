-- Migration: Rename theme 'classic' to 'neon'
-- Date: 2026-01-07
-- Description: Update existing menus from 'classic' theme to 'neon' theme

-- Update all menus that use 'classic' theme to 'neon'
UPDATE Menus 
SET theme = 'neon', 
    updatedAt = GETDATE()
WHERE theme = 'classic';

-- Print summary
DECLARE @affectedRows INT = @@ROWCOUNT;
PRINT 'Migration completed: ' + CAST(@affectedRows AS NVARCHAR(10)) + ' menu(s) updated from ''classic'' to ''neon''';

