-- Notifications System Migration
-- Creates notifications table and adds grace period tracking to subscriptions

-- Create Notifications Table
IF OBJECT_ID('Notifications', 'U') IS NULL
BEGIN
    CREATE TABLE Notifications (
        id INT PRIMARY KEY IDENTITY(1,1),
        userId INT NOT NULL FOREIGN KEY REFERENCES Users(id) ON DELETE CASCADE,
        type NVARCHAR(50) NOT NULL, -- 'subscription_created', 'subscription_expiring', 'subscription_expired', 'downgraded_to_free'
        title NVARCHAR(255) NOT NULL,
        titleAr NVARCHAR(255) NOT NULL,
        message NVARCHAR(1000) NOT NULL,
        messageAr NVARCHAR(1000) NOT NULL,
        isRead BIT NOT NULL DEFAULT 0,
        metadata NVARCHAR(MAX), -- JSON for additional data
        createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        readAt DATETIME2,
        INDEX idx_notifications_userId (userId),
        INDEX idx_notifications_isRead (isRead),
        INDEX idx_notifications_type (type),
        INDEX idx_notifications_createdAt (createdAt)
    );
    PRINT 'Notifications table created successfully!';
END
ELSE
BEGIN
    PRINT 'Notifications table already exists.';
END;

-- Add grace period columns to Subscriptions table
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Subscriptions') AND name = 'gracePeriodStartDate'
)
BEGIN
    ALTER TABLE Subscriptions ADD gracePeriodStartDate DATETIME2;
    PRINT 'Added gracePeriodStartDate column to Subscriptions table';
END;

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Subscriptions') AND name = 'gracePeriodEndDate'
)
BEGIN
    ALTER TABLE Subscriptions ADD gracePeriodEndDate DATETIME2;
    PRINT 'Added gracePeriodEndDate column to Subscriptions table';
END;

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Subscriptions') AND name = 'notificationSent'
)
BEGIN
    ALTER TABLE Subscriptions ADD notificationSent BIT NOT NULL DEFAULT 0;
    PRINT 'Added notificationSent column to Subscriptions table';
END;

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Subscriptions') AND name = 'expiryNotificationSent'
)
BEGIN
    ALTER TABLE Subscriptions ADD expiryNotificationSent BIT NOT NULL DEFAULT 0;
    PRINT 'Added expiryNotificationSent column to Subscriptions table';
END;

PRINT 'Notifications system migration completed successfully!';

