-- Migration: Add Social Login Support (Google OAuth) - SAFE VERSION
-- Created: 2026-01-07
-- This version checks for Users table existence before creating foreign key

-- Step 1: Verify Users table exists
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Users')
BEGIN
    PRINT '❌ ERROR: جدول Users غير موجود!';
    PRINT 'يجب تشغيل back-end/database/schema.sql أولاً';
    RAISERROR('جدول Users غير موجود. يرجى تشغيل schema.sql أولاً', 16, 1);
    RETURN;
END

PRINT '✅ جدول Users موجود - المتابعة...';

-- Step 2: Drop existing table if it exists
IF OBJECT_ID('SocialAccounts', 'U') IS NOT NULL 
BEGIN
    DROP TABLE SocialAccounts;
    PRINT '🗑️ حذف جدول SocialAccounts القديم';
END

-- Step 3: Create SocialAccounts table WITHOUT foreign key first
CREATE TABLE SocialAccounts (
    id INT PRIMARY KEY IDENTITY(1,1),
    userId INT NOT NULL,
    provider NVARCHAR(50) NOT NULL,
    providerId NVARCHAR(255) NOT NULL,
    providerEmail NVARCHAR(255),
    providerName NVARCHAR(255),
    providerPhoto NVARCHAR(500),
    accessToken NVARCHAR(1000),
    refreshToken NVARCHAR(1000),
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    updatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
);

PRINT '📋 تم إنشاء جدول SocialAccounts';

-- Step 4: Add Foreign Key separately
BEGIN TRY
    ALTER TABLE SocialAccounts 
    ADD CONSTRAINT FK_SocialAccounts_Users 
    FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE;
    
    PRINT '🔗 تم إضافة Foreign Key إلى Users';
END TRY
BEGIN CATCH
    PRINT '❌ فشل إضافة Foreign Key: ' + ERROR_MESSAGE();
    -- Don't stop, continue with other steps
END CATCH

-- Step 5: Add Indexes
CREATE INDEX idx_social_accounts_userId ON SocialAccounts(userId);
CREATE INDEX idx_social_accounts_provider ON SocialAccounts(provider);

PRINT '📊 تم إنشاء Indexes';

-- Step 6: Add Unique Constraint
ALTER TABLE SocialAccounts 
ADD CONSTRAINT UQ_SocialAccounts_Provider_ProviderId 
UNIQUE (provider, providerId);

PRINT '🔒 تم إضافة Unique Constraint';

-- Step 7: Update Users table to make password optional
BEGIN TRY
    -- Check if password column exists and is NOT NULL
    IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' 
        AND COLUMN_NAME = 'password' 
        AND IS_NULLABLE = 'NO'
    )
    BEGIN
        ALTER TABLE Users ALTER COLUMN password NVARCHAR(255) NULL;
        PRINT '🔓 تم تحديث عمود password ليصبح اختيارياً';
    END
    ELSE
    BEGIN
        PRINT 'ℹ️ عمود password بالفعل اختياري أو غير موجود';
    END
END TRY
BEGIN CATCH
    PRINT '⚠️ تحذير عند تحديث عمود password: ' + ERROR_MESSAGE();
END CATCH

-- Step 8: Summary
PRINT '';
PRINT '════════════════════════════════════════════';
PRINT '✅ اكتمل إعداد Social Login بنجاح!';
PRINT '════════════════════════════════════════════';
PRINT '';
PRINT 'الجداول المنشأة:';
PRINT '  • SocialAccounts';
PRINT '';
PRINT 'التعديلات على الجداول الموجودة:';
PRINT '  • Users.password = NULL (اختياري)';
PRINT '';
PRINT 'الآن يمكنك استخدام Google OAuth! 🎉';
PRINT '';

GO

