-- Script للتحقق من بيانات profileImage في جدول Users
-- للتأكد من أن الصور من Google يتم حفظها بشكل صحيح

PRINT '========================================';
PRINT 'Checking profileImage data in Users table';
PRINT '========================================';
PRINT '';

-- 1. عرض جميع المستخدمين مع صورهم
SELECT 
    id,
    name,
    email,
    profileImage,
    LEN(profileImage) as ImageUrlLength,
    CASE 
        WHEN profileImage IS NULL THEN '❌ NULL'
        WHEN profileImage = '' THEN '❌ Empty String'
        WHEN LEN(profileImage) > 0 THEN '✅ Has Image URL'
        ELSE '⚠️ Unknown'
    END as ImageStatus,
    createdAt,
    lastLoginAt
FROM Users
ORDER BY lastLoginAt DESC;

PRINT '';
PRINT '========================================';

-- 2. إحصائيات الصور
SELECT 
    COUNT(*) as TotalUsers,
    SUM(CASE WHEN profileImage IS NOT NULL AND profileImage != '' THEN 1 ELSE 0 END) as UsersWithImage,
    SUM(CASE WHEN profileImage IS NULL OR profileImage = '' THEN 1 ELSE 0 END) as UsersWithoutImage
FROM Users;

PRINT '';
PRINT '========================================';

-- 3. عرض حسابات Google Social
IF OBJECT_ID('SocialAccounts', 'U') IS NOT NULL
BEGIN
    PRINT 'Checking SocialAccounts table for Google logins:';
    PRINT '';
    
    SELECT 
        sa.id,
        sa.userId,
        u.name,
        u.email,
        sa.provider,
        sa.providerPhoto as GoogleProfilePhoto,
        u.profileImage as UserProfileImage,
        CASE 
            WHEN u.profileImage IS NULL OR u.profileImage = '' THEN '❌ Not synced'
            WHEN u.profileImage = sa.providerPhoto THEN '✅ Synced'
            ELSE '⚠️ Different'
        END as SyncStatus,
        sa.createdAt as LinkedAt
    FROM SocialAccounts sa
    INNER JOIN Users u ON sa.userId = u.id
    WHERE sa.provider = 'google'
    ORDER BY sa.createdAt DESC;
END
ELSE
BEGIN
    PRINT '❌ SocialAccounts table does not exist!';
    PRINT 'Please run migration: 017_add_social_login.sql';
END

PRINT '';
PRINT '========================================';
PRINT 'Check complete!';
PRINT '========================================';

