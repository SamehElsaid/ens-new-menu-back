-- Migration: Add menu customizations table
-- Date: 2026-01-07
-- Description: Add table to store menu customizations for Pro users

-- Check if Menus table exists first
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Menus')
BEGIN
    PRINT 'ERROR: Menus table does not exist. Please run the main schema.sql first.';
    RETURN;
END

-- Drop table if exists (for clean re-run)
IF OBJECT_ID('MenuCustomizations', 'U') IS NOT NULL 
BEGIN
    DROP TABLE MenuCustomizations;
    PRINT 'Dropped existing MenuCustomizations table';
END

-- Create menu customizations table
CREATE TABLE MenuCustomizations (
    id INT PRIMARY KEY IDENTITY(1,1),
    menuId INT NOT NULL,
    
    -- Color customizations (stored as hex colors)
    primaryColor NVARCHAR(20) DEFAULT '#14b8a6', -- teal-500
    secondaryColor NVARCHAR(20) DEFAULT '#06b6d4', -- cyan-500
    backgroundColor NVARCHAR(20) DEFAULT '#ffffff', -- white
    textColor NVARCHAR(20) DEFAULT '#0f172a', -- slate-900
    
    -- Text customizations (Arabic)
    heroTitleAr NVARCHAR(200) DEFAULT N'استكشف قائمتنا',
    heroSubtitleAr NVARCHAR(500) DEFAULT N'اختر من مجموعة متنوعة من الأطباق اللذيذة',
    
    -- Text customizations (English)
    heroTitleEn NVARCHAR(200) DEFAULT 'Explore Our Menu',
    heroSubtitleEn NVARCHAR(500) DEFAULT 'Choose from a variety of delicious dishes',
    
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    updatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    
    -- Add foreign key constraint
    CONSTRAINT FK_MenuCustomizations_Menus FOREIGN KEY (menuId) REFERENCES Menus(id) ON DELETE CASCADE,
    
    -- Ensure one customization per menu
    CONSTRAINT UQ_MenuCustomizations_MenuId UNIQUE (menuId),
    INDEX idx_menu_customizations_menuId (menuId)
);

PRINT 'MenuCustomizations table created successfully';

