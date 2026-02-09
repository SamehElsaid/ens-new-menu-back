-- ensmenu Platform Database Schema
-- SQL Server

-- Drop existing tables if they exist (for development only)
IF OBJECT_ID('Ads', 'U') IS NOT NULL DROP TABLE Ads;
IF OBJECT_ID('Ratings', 'U') IS NOT NULL DROP TABLE Ratings;
IF OBJECT_ID('BranchTranslations', 'U') IS NOT NULL DROP TABLE BranchTranslations;
IF OBJECT_ID('Branches', 'U') IS NOT NULL DROP TABLE Branches;
IF OBJECT_ID('MenuItemTranslations', 'U') IS NOT NULL DROP TABLE MenuItemTranslations;
IF OBJECT_ID('MenuItems', 'U') IS NOT NULL DROP TABLE MenuItems;
IF OBJECT_ID('MenuTranslations', 'U') IS NOT NULL DROP TABLE MenuTranslations;
IF OBJECT_ID('Menus', 'U') IS NOT NULL DROP TABLE Menus;
IF OBJECT_ID('Subscriptions', 'U') IS NOT NULL DROP TABLE Subscriptions;
IF OBJECT_ID('Plans', 'U') IS NOT NULL DROP TABLE Plans;
IF OBJECT_ID('PasswordResets', 'U') IS NOT NULL DROP TABLE PasswordResets;
IF OBJECT_ID('EmailVerifications', 'U') IS NOT NULL DROP TABLE EmailVerifications;
IF OBJECT_ID('Users', 'U') IS NOT NULL DROP TABLE Users;

-- Users Table
CREATE TABLE Users (
    id INT PRIMARY KEY IDENTITY(1,1),
    email NVARCHAR(255) NOT NULL UNIQUE,
    password NVARCHAR(255) NOT NULL,
    name NVARCHAR(255) NOT NULL,
    role NVARCHAR(50) NOT NULL DEFAULT 'user', -- 'user' or 'admin'
    phoneNumber NVARCHAR(50),
    country NVARCHAR(100),
    dateOfBirth DATE,
    gender NVARCHAR(20), -- 'male', 'female', 'other'
    address NVARCHAR(500),
    profileImage NVARCHAR(500),
    isEmailVerified BIT NOT NULL DEFAULT 0,
    emailVerifiedAt DATETIME2,
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    lastLoginAt DATETIME2,
    INDEX idx_users_email (email),
    INDEX idx_users_role (role)
);

-- Email Verifications Table
CREATE TABLE EmailVerifications (
    id INT PRIMARY KEY IDENTITY(1,1),
    userId INT NOT NULL FOREIGN KEY REFERENCES Users(id) ON DELETE CASCADE,
    token NVARCHAR(500) NOT NULL UNIQUE,
    expiresAt DATETIME2 NOT NULL,
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    INDEX idx_email_verifications_token (token),
    INDEX idx_email_verifications_userId (userId)
);

-- Password Resets Table
CREATE TABLE PasswordResets (
    id INT PRIMARY KEY IDENTITY(1,1),
    userId INT NOT NULL FOREIGN KEY REFERENCES Users(id) ON DELETE CASCADE,
    token NVARCHAR(500) NOT NULL UNIQUE,
    expiresAt DATETIME2 NOT NULL,
    isUsed BIT NOT NULL DEFAULT 0,
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    INDEX idx_password_resets_token (token),
    INDEX idx_password_resets_userId (userId)
);

-- Plans Table
CREATE TABLE Plans (
    id INT PRIMARY KEY IDENTITY(1,1),
    name NVARCHAR(100) NOT NULL,
    priceMonthly DECIMAL(10, 2) NOT NULL,
    priceYearly DECIMAL(10, 2) NOT NULL,
    maxMenus INT NOT NULL,
    maxProductsPerMenu INT NOT NULL, -- -1 for unlimited
    allowCustomDomain BIT NOT NULL DEFAULT 0,
    hasAds BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE()
);

-- Insert default plans
INSERT INTO Plans (name, priceMonthly, priceYearly, maxMenus, maxProductsPerMenu, allowCustomDomain, hasAds)
VALUES 
    ('Free', 0.00, 0.00, 1, 20, 0, 1),
    ('Monthly', 29.99, 299.99, 3, 100, 0, 0),
    ('Yearly', 19.99, 199.99, 10, -1, 1, 0);

-- Subscriptions Table
CREATE TABLE Subscriptions (
    id INT PRIMARY KEY IDENTITY(1,1),
    userId INT NOT NULL FOREIGN KEY REFERENCES Users(id) ON DELETE CASCADE,
    planId INT NOT NULL FOREIGN KEY REFERENCES Plans(id),
    billingCycle NVARCHAR(20) NOT NULL, -- 'monthly', 'yearly', 'free'
    startDate DATETIME2 NOT NULL DEFAULT GETDATE(),
    endDate DATETIME2,
    status NVARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled'
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    INDEX idx_subscriptions_userId (userId),
    INDEX idx_subscriptions_status (status)
);

-- Menus Table
CREATE TABLE Menus (
    id INT PRIMARY KEY IDENTITY(1,1),
    userId INT NOT NULL FOREIGN KEY REFERENCES Users(id) ON DELETE CASCADE,
    slug NVARCHAR(200) NOT NULL UNIQUE,
    logo NVARCHAR(500),
    theme NVARCHAR(50) NOT NULL DEFAULT 'default', -- 'default', 'neon', 'modern', 'minimal', etc.
    isActive BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    updatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    INDEX idx_menus_slug (slug),
    INDEX idx_menus_userId (userId),
    INDEX idx_menus_isActive (isActive)
);

-- Menu Translations Table
CREATE TABLE MenuTranslations (
    id INT PRIMARY KEY IDENTITY(1,1),
    menuId INT NOT NULL FOREIGN KEY REFERENCES Menus(id) ON DELETE CASCADE,
    locale NVARCHAR(10) NOT NULL, -- 'ar' or 'en'
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(1000),
    INDEX idx_menu_translations_menuId (menuId),
    INDEX idx_menu_translations_locale (locale),
    UNIQUE (menuId, locale)
);

-- Menu Items Table
CREATE TABLE MenuItems (
    id INT PRIMARY KEY IDENTITY(1,1),
    menuId INT NOT NULL FOREIGN KEY REFERENCES Menus(id) ON DELETE CASCADE,
    price DECIMAL(10, 2) NOT NULL,
    image NVARCHAR(500),
    category NVARCHAR(100) NOT NULL, -- 'starters', 'main', 'desserts', 'drinks', etc.
    available BIT NOT NULL DEFAULT 1,
    sortOrder INT NOT NULL DEFAULT 0,
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    updatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    INDEX idx_menu_items_menuId (menuId),
    INDEX idx_menu_items_category (category),
    INDEX idx_menu_items_sortOrder (sortOrder)
);

-- Menu Item Translations Table
CREATE TABLE MenuItemTranslations (
    id INT PRIMARY KEY IDENTITY(1,1),
    menuItemId INT NOT NULL FOREIGN KEY REFERENCES MenuItems(id) ON DELETE CASCADE,
    locale NVARCHAR(10) NOT NULL, -- 'ar' or 'en'
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(1000),
    INDEX idx_menu_item_translations_menuItemId (menuItemId),
    INDEX idx_menu_item_translations_locale (locale),
    UNIQUE (menuItemId, locale)
);

-- Branches Table
CREATE TABLE Branches (
    id INT PRIMARY KEY IDENTITY(1,1),
    menuId INT NOT NULL FOREIGN KEY REFERENCES Menus(id) ON DELETE CASCADE,
    phone NVARCHAR(50),
    latitude NVARCHAR(50),
    longitude NVARCHAR(50),
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    INDEX idx_branches_menuId (menuId)
);

-- Branch Translations Table
CREATE TABLE BranchTranslations (
    id INT PRIMARY KEY IDENTITY(1,1),
    branchId INT NOT NULL FOREIGN KEY REFERENCES Branches(id) ON DELETE CASCADE,
    locale NVARCHAR(10) NOT NULL, -- 'ar' or 'en'
    name NVARCHAR(255) NOT NULL,
    address NVARCHAR(500),
    INDEX idx_branch_translations_branchId (branchId),
    INDEX idx_branch_translations_locale (locale),
    UNIQUE (branchId, locale)
);

-- Ratings Table
CREATE TABLE Ratings (
    id INT PRIMARY KEY IDENTITY(1,1),
    menuId INT NOT NULL FOREIGN KEY REFERENCES Menus(id) ON DELETE CASCADE,
    stars INT NOT NULL CHECK (stars >= 1 AND stars <= 5),
    comment NVARCHAR(1000),
    customerName NVARCHAR(255),
    ipAddress NVARCHAR(50),
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    INDEX idx_ratings_menuId (menuId),
    INDEX idx_ratings_createdAt (createdAt),
    INDEX idx_ratings_ipAddress (ipAddress)
);

-- Ads Table (for free plan menus)
CREATE TABLE Ads (
    id INT PRIMARY KEY IDENTITY(1,1),
    menuId INT NOT NULL FOREIGN KEY REFERENCES Menus(id) ON DELETE CASCADE,
    title NVARCHAR(255) NOT NULL,
    imageUrl NVARCHAR(500) NOT NULL,
    link NVARCHAR(500),
    isActive BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
    INDEX idx_ads_menuId (menuId),
    INDEX idx_ads_isActive (isActive)
);

-- Create a trigger to update the updatedAt column
GO
CREATE TRIGGER trg_menus_updatedat
ON Menus
AFTER UPDATE
AS
BEGIN
    UPDATE Menus
    SET updatedAt = GETDATE()
    WHERE id IN (SELECT DISTINCT id FROM Inserted);
END;
GO

CREATE TRIGGER trg_menu_items_updatedat
ON MenuItems
AFTER UPDATE
AS
BEGIN
    UPDATE MenuItems
    SET updatedAt = GETDATE()
    WHERE id IN (SELECT DISTINCT id FROM Inserted);
END;
GO

PRINT 'Database schema created successfully!';


