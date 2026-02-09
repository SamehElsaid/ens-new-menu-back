-- Enhance Ads Table Migration
-- Add bilingual support and additional fields for comprehensive ad management

-- Add titleAr column for Arabic title
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'titleAr'
)
BEGIN
    ALTER TABLE Ads ADD titleAr NVARCHAR(255);
END;

-- Add content column for English content
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'content'
)
BEGIN
    ALTER TABLE Ads ADD content NVARCHAR(1000);
END;

-- Add contentAr column for Arabic content
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'contentAr'
)
BEGIN
    ALTER TABLE Ads ADD contentAr NVARCHAR(1000);
END;

-- Add position column for ad placement
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'position'
)
BEGIN
    ALTER TABLE Ads ADD position NVARCHAR(50); -- 'header', 'sidebar', 'footer', 'banner', etc.
    CREATE INDEX idx_ads_position ON Ads(position);
END;

-- Add linkUrl column (rename from link if needed, or add if missing)
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'linkUrl'
)
BEGIN
    -- Check if 'link' column exists and rename it, otherwise create new
    IF EXISTS (
        SELECT * FROM sys.columns 
        WHERE object_id = OBJECT_ID('Ads') AND name = 'link'
    )
    BEGIN
        EXEC sp_rename 'Ads.link', 'linkUrl', 'COLUMN';
    END
    ELSE
    BEGIN
        ALTER TABLE Ads ADD linkUrl NVARCHAR(500);
    END
END;

-- Add startDate column for scheduled ads
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'startDate'
)
BEGIN
    ALTER TABLE Ads ADD startDate DATETIME2;
    CREATE INDEX idx_ads_startDate ON Ads(startDate);
END;

-- Add endDate column for scheduled ads
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID('Ads') AND name = 'endDate'
)
BEGIN
    ALTER TABLE Ads ADD endDate DATETIME2;
    CREATE INDEX idx_ads_endDate ON Ads(endDate);
END;

PRINT 'Ads table enhancement migration completed successfully!';

