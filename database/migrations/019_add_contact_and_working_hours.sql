-- Migration: Add contact information and working hours to Menus table
-- Date: 2026-01-XX
-- Description: Add address, phone, and working hours for menu settings

USE SaaSMenuDB;
GO

-- Add address field (supports both English and Arabic)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'addressEn')
BEGIN
    ALTER TABLE Menus ADD addressEn NVARCHAR(500) NULL;
    PRINT 'Added addressEn column to Menus table';
END
ELSE
BEGIN
    PRINT 'addressEn column already exists in Menus table';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'addressAr')
BEGIN
    ALTER TABLE Menus ADD addressAr NVARCHAR(500) NULL;
    PRINT 'Added addressAr column to Menus table';
END
ELSE
BEGIN
    PRINT 'addressAr column already exists in Menus table';
END
GO

-- Add phone number field
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'phone')
BEGIN
    ALTER TABLE Menus ADD phone NVARCHAR(50) NULL;
    PRINT 'Added phone column to Menus table';
END
ELSE
BEGIN
    PRINT 'phone column already exists in Menus table';
END
GO

-- Add working hours field (JSON format to store hours for each day)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Menus') AND name = 'workingHours')
BEGIN
    ALTER TABLE Menus ADD workingHours NVARCHAR(MAX) NULL;
    PRINT 'Added workingHours column to Menus table';
END
ELSE
BEGIN
    PRINT 'workingHours column already exists in Menus table';
END
GO

PRINT 'Migration 019 completed successfully';
GO
