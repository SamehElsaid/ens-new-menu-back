-- Migration: Add currency column to Menus table
-- Date: 2025-01-04
-- Description: Add currency field to store menu currency (SAR, USD, EUR, etc.)

-- Check if column exists before adding
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Menus' 
    AND COLUMN_NAME = 'currency'
)
BEGIN
    -- Add currency column with default value 'SAR'
    ALTER TABLE Menus
    ADD currency NVARCHAR(3) NOT NULL DEFAULT 'SAR';
    
    PRINT 'Currency column added to Menus table successfully';
END
ELSE
BEGIN
    PRINT 'Currency column already exists in Menus table';
END
GO

-- Update existing menus to have SAR as default currency if they don't have one
UPDATE Menus
SET currency = 'SAR'
WHERE currency IS NULL OR currency = '';
GO

PRINT 'Migration completed: Currency field added to Menus table';


