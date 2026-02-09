-- Admin System Migration
-- Add suspended status for users and global ads management

-- Add role column to Users table
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Users') AND name = 'role'
)
BEGIN
    ALTER TABLE Users ADD role NVARCHAR(50) NOT NULL DEFAULT 'user';
    CREATE INDEX idx_users_role ON Users(role);
END;

-- Add isSuspended column to Users table
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Users') AND name = 'isSuspended'
)
BEGIN
    ALTER TABLE Users ADD isSuspended BIT NOT NULL DEFAULT 0;
    CREATE INDEX idx_users_isSuspended ON Users(isSuspended);
END;

-- Add suspendedAt column to Users table
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Users') AND name = 'suspendedAt'
)
BEGIN
    ALTER TABLE Users ADD suspendedAt DATETIME2;
END;

-- Add suspendedReason column to Users table
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Users') AND name = 'suspendedReason'
)
BEGIN
    ALTER TABLE Users ADD suspendedReason NVARCHAR(500);
END;

-- Modify Ads table to support global ads (not tied to specific menu)
-- Make menuId nullable for global ads
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Ads') AND name = 'menuId')
BEGIN
    -- Drop the existing foreign key constraint
    DECLARE @ConstraintName nvarchar(200)
    SELECT @ConstraintName = Name FROM sys.foreign_keys 
    WHERE parent_object_id = OBJECT_ID('Ads') AND referenced_object_id = OBJECT_ID('Menus')
    
    IF @ConstraintName IS NOT NULL
        EXEC('ALTER TABLE Ads DROP CONSTRAINT ' + @ConstraintName)
    
    -- Make menuId nullable
    ALTER TABLE Ads ALTER COLUMN menuId INT NULL;
    
    -- Add the foreign key back with nullable support
    ALTER TABLE Ads ADD CONSTRAINT FK_Ads_Menus 
        FOREIGN KEY (menuId) REFERENCES Menus(id) ON DELETE CASCADE;
END;

-- Add type column to distinguish between global and menu-specific ads
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'adType'
)
BEGIN
    ALTER TABLE Ads ADD adType NVARCHAR(20) NOT NULL DEFAULT 'menu'; -- 'menu' or 'global'
    CREATE INDEX idx_ads_adType ON Ads(adType);
END;

-- Add displayOrder column for ads
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'displayOrder'
)
BEGIN
    ALTER TABLE Ads ADD displayOrder INT NOT NULL DEFAULT 0;
    CREATE INDEX idx_ads_displayOrder ON Ads(displayOrder);
END;

-- Add clickCount column for ads analytics
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'clickCount'
)
BEGIN
    ALTER TABLE Ads ADD clickCount INT NOT NULL DEFAULT 0;
END;

-- Add impressionCount column for ads analytics
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'impressionCount'
)
BEGIN
    ALTER TABLE Ads ADD impressionCount INT NOT NULL DEFAULT 0;
END;

-- Add payment tracking columns to Subscriptions table
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Subscriptions') AND name = 'amount'
)
BEGIN
    ALTER TABLE Subscriptions ADD amount DECIMAL(10, 2) NOT NULL DEFAULT 0;
END;

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Subscriptions') AND name = 'paymentMethod'
)
BEGIN
    ALTER TABLE Subscriptions ADD paymentMethod NVARCHAR(50);
END;

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Subscriptions') AND name = 'paymentStatus'
)
BEGIN
    ALTER TABLE Subscriptions ADD paymentStatus NVARCHAR(50) DEFAULT 'pending'; -- 'pending', 'completed', 'failed'
END;

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Subscriptions') AND name = 'paidAt'
)
BEGIN
    ALTER TABLE Subscriptions ADD paidAt DATETIME2;
END;

-- Add features JSON column to Plans table for flexible plan features
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Plans') AND name = 'features'
)
BEGIN
    ALTER TABLE Plans ADD features NVARCHAR(MAX); -- JSON string of features
END;

-- Add isActive column to Plans table
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Plans') AND name = 'isActive'
)
BEGIN
    ALTER TABLE Plans ADD isActive BIT NOT NULL DEFAULT 1;
END;

-- Add description column to Plans table
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Plans') AND name = 'description'
)
BEGIN
    ALTER TABLE Plans ADD description NVARCHAR(500);
END;

PRINT 'Admin system migration completed successfully!';

