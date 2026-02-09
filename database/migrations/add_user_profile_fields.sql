-- Migration: Add profile fields to Users table
-- Date: 2024-12-24
-- Description: Add country, dateOfBirth, gender, and address fields

-- Add new columns to Users table
ALTER TABLE Users
ADD country NVARCHAR(100),
    dateOfBirth DATE,
    gender NVARCHAR(20),
    address NVARCHAR(500);

-- Add comments for documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'User country/nationality', 
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'Users',
    @level2type = N'COLUMN', @level2name = N'country';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'User date of birth', 
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'Users',
    @level2type = N'COLUMN', @level2name = N'dateOfBirth';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'User gender: male, female, other', 
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'Users',
    @level2type = N'COLUMN', @level2name = N'gender';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'User full address', 
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'Users',
    @level2type = N'COLUMN', @level2name = N'address';

PRINT 'Migration completed: Added country, dateOfBirth, gender, and address fields to Users table';

