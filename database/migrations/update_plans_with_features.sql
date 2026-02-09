-- Update Plans with complete features and descriptions
-- Run this script to add features and descriptions to existing plans

USE [SaaSMenuDB];
GO

PRINT '🚀 Starting plans update...';
GO

-- Update Free Plan
UPDATE Plans
SET 
  description = N'خطة مجانية',
  priceMonthly = 0,
  priceYearly = 0,
  maxMenus = 1,
  maxProductsPerMenu = 50,
  hasAds = 1,
  allowCustomDomain = 0,
  features = N'["منيو واحد","50 منتج","إعلانات","بدون تعديلات"]',
  isActive = 1
WHERE name = 'Free';
GO

PRINT '✅ Updated Free plan';
GO

-- Update Pro Plan (previously Monthly)
-- Note: Set your desired prices here. Example prices shown below.
UPDATE Plans
SET 
  name = N'Pro',
  description = N'خطة احترافية',
  priceMonthly = 29.99,  -- السعر الشهري (يمكن تعديله حسب الحاجة)
  priceYearly = 299.99,  -- السعر السنوي (يمكن تعديله حسب الحاجة)
  maxMenus = 3,
  maxProductsPerMenu = 200,
  hasAds = 0,
  allowCustomDomain = 0,
  features = N'["3 منيو","200 منتج لكل قائمة","تحكم في الإعلانات","شامل التعديلات"]',
  isActive = 1
WHERE name = 'Monthly' OR name = 'Pro';
GO

PRINT '✅ Updated Pro plan with monthly pricing';
GO

-- Add or Update Customize Plan (Coming Soon)
IF EXISTS (SELECT 1 FROM Plans WHERE name = 'Yearly')
BEGIN
  UPDATE Plans
  SET 
    name = N'Customize',
    description = N'قريباً - خطة مخصصة حسب احتياجاتك',
    priceMonthly = 0,
    priceYearly = 0,
    maxMenus = -1,
    maxProductsPerMenu = -1,
    hasAds = 0,
    allowCustomDomain = 1,
    features = N'["قريباً","اتصل بنا للمزيد من التفاصيل"]',
    isActive = 0
  WHERE name = 'Yearly';
  PRINT '✅ Updated Customize plan (Coming Soon)';
END
ELSE
BEGIN
  INSERT INTO Plans (
    name, description, priceMonthly, priceYearly, 
    maxMenus, maxProductsPerMenu, allowCustomDomain, 
    hasAds, features, isActive
  )
  VALUES (
    N'Customize',
    N'قريباً - خطة مخصصة حسب احتياجاتك',
    0, 0, -1, -1, 1, 0,
    N'["قريباً","اتصل بنا للمزيد من التفاصيل"]',
    0
  );
  PRINT '✅ Created Customize plan (Coming Soon)';
END
GO

-- Display updated plans
PRINT '📋 Updated Plans:';
SELECT 
  id,
  name,
  description,
  priceMonthly,
  priceYearly,
  maxMenus,
  maxProductsPerMenu,
  allowCustomDomain,
  hasAds,
  isActive,
  features
FROM Plans
ORDER BY 
  CASE 
    WHEN name = 'Free' THEN 1
    WHEN name = 'Pro' THEN 2
    WHEN name = 'Customize' THEN 3
    ELSE 4
  END;
GO

PRINT '';
PRINT '✅ All plans updated successfully!';
PRINT '';
PRINT '📊 Plans Summary:';
PRINT '  1. Free: 1 منيو، 50 منتج، إعلانات، بدون تعديلات (مجاني)';
PRINT '  2. Pro: 3 منيو، 200 منتج، تحكم بالإعلانات، شامل التعديلات (سعر شهري)';
PRINT '  3. Customize: Coming Soon (غير نشط)';
PRINT '';
PRINT '💡 Test API: http://localhost:5000/api/public/plans';
PRINT '🎨 Manage plans: http://localhost:3000/admin/plans';
PRINT '📝 Note: Frontend displays MONTHLY price for Pro plan';
PRINT '';
GO

