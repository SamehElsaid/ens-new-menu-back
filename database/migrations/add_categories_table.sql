-- Migration: Add Categories table with translations and discount support
-- Date: 2025-12-24

-- Check if Menus table exists
IF OBJECT_ID('Menus', 'U') IS NULL
BEGIN
    RAISERROR('ERROR: Menus table does not exist. Please run schema.sql first!', 16, 1);
    SET NOEXEC ON;
END

-- Check if MenuItems table exists
IF OBJECT_ID('MenuItems', 'U') IS NULL
BEGIN
    RAISERROR('ERROR: MenuItems table does not exist. Please run schema.sql first!', 16, 1);
    SET NOEXEC ON;
END

SET NOEXEC OFF;

-- Create Categories Table
IF OBJECT_ID('CategoryTranslations', 'U') IS NOT NULL DROP TABLE CategoryTranslations;
IF OBJECT_ID('Categories', 'U') IS NOT NULL DROP TABLE Categories;

CREATE TABLE Categories (
    id INT PRIMARY KEY IDENTITY(1,1),
    menuId INT NOT NULL,
    image NVARCHAR(500),
    sortOrder INT NOT NULL DEFAULT 0,
    isActive BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    updatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    INDEX idx_categories_menuId (menuId),
    INDEX idx_categories_sortOrder (sortOrder),
    INDEX idx_categories_isActive (isActive)
);

-- Add foreign key to Menus (after table creation)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_NAME = 'Categories' AND CONSTRAINT_NAME = 'FK_Categories_Menus')
BEGIN
    ALTER TABLE Categories
    ADD CONSTRAINT FK_Categories_Menus 
        FOREIGN KEY (menuId) REFERENCES Menus(id) ON DELETE CASCADE;
END

-- Create Category Translations Table
CREATE TABLE CategoryTranslations (
    id INT PRIMARY KEY IDENTITY(1,1),
    categoryId INT NOT NULL,
    locale NVARCHAR(10) NOT NULL, -- 'ar' or 'en'
    name NVARCHAR(255) NOT NULL,
    INDEX idx_category_translations_categoryId (categoryId),
    INDEX idx_category_translations_locale (locale),
    UNIQUE (categoryId, locale)
);

-- Add foreign key to Categories
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_NAME = 'CategoryTranslations' AND CONSTRAINT_NAME = 'FK_CategoryTranslations_Categories')
BEGIN
    ALTER TABLE CategoryTranslations
    ADD CONSTRAINT FK_CategoryTranslations_Categories 
        FOREIGN KEY (categoryId) REFERENCES Categories(id) ON DELETE CASCADE;
END

-- Add categoryId to MenuItems and discount fields (only if they don't exist)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MenuItems' AND COLUMN_NAME = 'categoryId')
BEGIN
    ALTER TABLE MenuItems
    ADD categoryId INT NULL;
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MenuItems' AND COLUMN_NAME = 'originalPrice')
BEGIN
    ALTER TABLE MenuItems
    ADD originalPrice DECIMAL(10, 2) NULL; -- السعر الأصلي قبل الخصم
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MenuItems' AND COLUMN_NAME = 'discountPercent')
BEGIN
    ALTER TABLE MenuItems
    ADD discountPercent INT NULL; -- نسبة الخصم
END

-- Add CHECK constraint for discountPercent (only if it doesn't exist)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE WHERE TABLE_NAME = 'MenuItems' AND CONSTRAINT_NAME = 'CK_MenuItems_discountPercent')
BEGIN
    ALTER TABLE MenuItems
    ADD CONSTRAINT CK_MenuItems_discountPercent 
        CHECK (discountPercent IS NULL OR (discountPercent >= 0 AND discountPercent <= 100));
END

-- Add foreign key constraint with NO ACTION to avoid cascade cycles
-- Note: NO ACTION means you must manually handle category deletion
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_NAME = 'MenuItems' AND CONSTRAINT_NAME = 'FK_MenuItems_Categories')
BEGIN
    ALTER TABLE MenuItems
    ADD CONSTRAINT FK_MenuItems_Categories 
        FOREIGN KEY (categoryId) REFERENCES Categories(id) ON DELETE NO ACTION;
END

-- Add index for categoryId (only if it doesn't exist)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_menu_items_categoryId' AND object_id = OBJECT_ID('MenuItems'))
BEGIN
    CREATE INDEX idx_menu_items_categoryId ON MenuItems(categoryId);
END

-- Note: Keep the old 'category' column for backward compatibility
-- You can migrate existing data and then drop it later

-- Trigger for Categories updatedAt
GO
IF OBJECT_ID('trg_categories_updatedat', 'TR') IS NOT NULL
    DROP TRIGGER trg_categories_updatedat;
GO

CREATE TRIGGER trg_categories_updatedat
ON Categories
AFTER UPDATE
AS
BEGIN
    UPDATE Categories
    SET updatedAt = GETDATE()
    WHERE id IN (SELECT DISTINCT id FROM Inserted);
END;
GO

PRINT 'Categories migration completed successfully!';

