-- Migration: Increase RefreshTokens token column lengths for JWT
-- JWT refresh tokens can exceed 500 chars; truncation broke replacement chain (revoked token fix)
ALTER TABLE RefreshTokens ALTER COLUMN token NVARCHAR(1000) NOT NULL;
ALTER TABLE RefreshTokens ALTER COLUMN replacedByToken NVARCHAR(1000) NULL;
