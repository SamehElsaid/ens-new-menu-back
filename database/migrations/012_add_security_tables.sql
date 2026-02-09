-- Migration: Add Security Tables (Token Blacklist & Login Attempts)
-- Date: 2024-12-30
-- Description: Add tables for token blacklist and login attempt tracking

-- Token Blacklist Table
-- Stores revoked/blacklisted tokens
CREATE TABLE TokenBlacklist (
    id INT IDENTITY(1,1) PRIMARY KEY,
    token NVARCHAR(500) NOT NULL UNIQUE,
    userId INT NOT NULL,
    tokenType NVARCHAR(20) NOT NULL CHECK (tokenType IN ('access', 'refresh')),
    reason NVARCHAR(255) NULL,
    expiresAt DATETIME2 NOT NULL,
    createdAt DATETIME2 DEFAULT GETDATE(),
    FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
);

-- Index for fast token lookup
CREATE INDEX IX_TokenBlacklist_Token ON TokenBlacklist(token);
CREATE INDEX IX_TokenBlacklist_ExpiresAt ON TokenBlacklist(expiresAt);

-- Login Attempts Table
-- Tracks failed login attempts for account lockout
CREATE TABLE LoginAttempts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email NVARCHAR(255) NOT NULL,
    ipAddress NVARCHAR(50) NOT NULL,
    success BIT NOT NULL DEFAULT 0,
    attemptedAt DATETIME2 DEFAULT GETDATE(),
    userAgent NVARCHAR(500) NULL
);

-- Index for fast lookup by email and time
CREATE INDEX IX_LoginAttempts_Email_Time ON LoginAttempts(email, attemptedAt);
CREATE INDEX IX_LoginAttempts_IP_Time ON LoginAttempts(ipAddress, attemptedAt);

-- Refresh Token Storage Table
-- Stores active refresh tokens for rotation
CREATE TABLE RefreshTokens (
    id INT IDENTITY(1,1) PRIMARY KEY,
    userId INT NOT NULL,
    token NVARCHAR(500) NOT NULL UNIQUE,
    expiresAt DATETIME2 NOT NULL,
    isRevoked BIT DEFAULT 0,
    replacedByToken NVARCHAR(500) NULL,
    createdAt DATETIME2 DEFAULT GETDATE(),
    revokedAt DATETIME2 NULL,
    FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
);

-- Index for fast token lookup
CREATE INDEX IX_RefreshTokens_Token ON RefreshTokens(token);
CREATE INDEX IX_RefreshTokens_UserId ON RefreshTokens(userId);

-- Add account lockout fields to Users table
ALTER TABLE Users ADD 
    isLocked BIT DEFAULT 0,
    lockedUntil DATETIME2 NULL,
    failedLoginAttempts INT DEFAULT 0,
    lastFailedLoginAt DATETIME2 NULL;

PRINT 'Security tables created successfully';

