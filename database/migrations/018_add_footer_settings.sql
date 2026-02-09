-- Migration: Add footer settings to Menus table
-- Date: 2026-01-09
-- Description: Add footer logo, description and social media links for Pro users

USE SaaSMenuDB;
GO

-- Check if columns already exist before adding them
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'footerLogo')
BEGIN
    ALTER TABLE Menus ADD footerLogo NVARCHAR(500) NULL;
    PRINT 'Added footerLogo column to Menus table';
END
ELSE
BEGIN
    PRINT 'footerLogo column already exists in Menus table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'footerDescriptionEn')
BEGIN
    ALTER TABLE Menus ADD footerDescriptionEn NVARCHAR(1000) NULL;
    PRINT 'Added footerDescriptionEn column to Menus table';
END
ELSE
BEGIN
    PRINT 'footerDescriptionEn column already exists in Menus table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'footerDescriptionAr')
BEGIN
    ALTER TABLE Menus ADD footerDescriptionAr NVARCHAR(1000) NULL;
    PRINT 'Added footerDescriptionAr column to Menus table';
END
ELSE
BEGIN
    PRINT 'footerDescriptionAr column already exists in Menus table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'socialFacebook')
BEGIN
    ALTER TABLE Menus ADD socialFacebook NVARCHAR(500) NULL;
    PRINT 'Added socialFacebook column to Menus table';
END
ELSE
BEGIN
    PRINT 'socialFacebook column already exists in Menus table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'socialInstagram')
BEGIN
    ALTER TABLE Menus ADD socialInstagram NVARCHAR(500) NULL;
    PRINT 'Added socialInstagram column to Menus table';
END
ELSE
BEGIN
    PRINT 'socialInstagram column already exists in Menus table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'socialTwitter')
BEGIN
    ALTER TABLE Menus ADD socialTwitter NVARCHAR(500) NULL;
    PRINT 'Added socialTwitter column to Menus table';
END
ELSE
BEGIN
    PRINT 'socialTwitter column already exists in Menus table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'socialWhatsapp')
BEGIN
    ALTER TABLE Menus ADD socialWhatsapp NVARCHAR(50) NULL;
    PRINT 'Added socialWhatsapp column to Menus table';
END
ELSE
BEGIN
    PRINT 'socialWhatsapp column already exists in Menus table';
END
GO

PRINT 'Migration 018 completed successfully';
GO
