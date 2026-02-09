-- Migration: Add Social Login Support (Google OAuth)
-- Created: 2026-01-07

-- Drop table if exists
IF OBJECT_ID('SocialAccounts', 'U') IS NOT NULL 
BEGIN
    DROP TABLE SocialAccounts;
    PRINT 'Dropped existing SocialAccounts table';
END

-- Create SocialAccounts table to link users with their social login providers
CREATE TABLE SocialAccounts (
    id INT PRIMARY KEY IDENTITY(1,1),
    userId INT NOT NULL,
    provider NVARCHAR(50) NOT NULL, -- 'google', 'facebook', 'apple', etc.
    providerId NVARCHAR(255) NOT NULL, -- The unique ID from the provider
    providerEmail NVARCHAR(255), -- Email from provider
    providerName NVARCHAR(255), -- Name from provider
    providerPhoto NVARCHAR(500), -- Profile photo URL from provider
    accessToken NVARCHAR(1000), -- For future API calls (optional)
    refreshToken NVARCHAR(1000), -- For token refresh (optional)
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    updatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    
    -- Foreign Key Constraint
    CONSTRAINT FK_SocialAccounts_Users FOREIGN KEY (userId) 
        REFERENCES Users(id) ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_social_accounts_userId (userId),
    INDEX idx_social_accounts_provider (provider),
    
    -- Unique Constraint - Each provider ID can only be linked once
    CONSTRAINT UQ_SocialAccounts_Provider_ProviderId UNIQUE (provider, providerId)
);

PRINT 'Created SocialAccounts table';

-- Update Users table to make password optional (for social login only users)
ALTER TABLE Users ALTER COLUMN password NVARCHAR(255) NULL;

PRINT 'Updated Users table - password is now optional';

GO

PRINT '✅ Social login migration completed successfully!';

