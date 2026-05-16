import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getPool, sql, executeTransaction } from "../config/database";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/tokenHelper";
import {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from "../services/emailService";
import { TOKEN_EXPIRY, ROLES } from "../config/constants";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { LoginAttemptsService } from "../services/loginAttempts.service";
import { RefreshTokenService } from "../services/refreshToken.service";
import { TokenBlacklistService } from "../services/tokenBlacklist.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import {
  getUserFcmTokens,
  MAX_FCM_TOKEN_LEN,
  removeUserFcmToken,
} from "../services/fcmPush.service";

// Check Availability (Email or Phone Number)
export async function checkAvailability(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { email, phoneNumber } = req.query;

    if (!email && !phoneNumber) {
      sendApiError(res, req, 400, ApiErrors.emailOrPhoneRequired);
      return;
    }

    const pool = await getPool();
    let isAvailable = false;

    // Check email if provided
    if (email) {
      const emailResult = await pool
        .request()
        .input("email", sql.NVarChar, (email as string).toLowerCase())
        .query("SELECT id FROM Users WHERE email = @email");

      isAvailable = emailResult.recordset.length === 0; // true if available
    }

    // Check phone number if provided
    if (phoneNumber) {
      const phoneResult = await pool
        .request()
        .input("phoneNumber", sql.NVarChar, phoneNumber as string)
        .query("SELECT id FROM Users WHERE phoneNumber = @phoneNumber");

      isAvailable = phoneResult.recordset.length === 0; // true if available
    }

    res.json({
      isAvailable,
      message: isAvailable
        ? `${email ? "Email" : "Phone number"} is available`
        : `${email ? "Email" : "Phone number"} is already in use`,
    });
  } catch (error) {
    logger.error("Check availability error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCheckAvailability);
  }
}

// Sign Up
export async function signup(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name, phoneNumber, locale = "ar" } = req.body;

    // Validate required fields
    if (!phoneNumber) {
      sendApiError(res, req, 400, ApiErrors.phoneRequired);
      return;
    }

    const pool = await getPool();

    // Check if email exists
    const existingEmail = await pool
      .request()
      .input("email", sql.NVarChar, email.toLowerCase())
      .query("SELECT id FROM Users WHERE email = @email");

    if (existingEmail.recordset.length > 0) {
      sendApiError(res, req, 400, ApiErrors.emailAlreadyRegistered);
      return;
    }

    // Check if phone number exists
    const existingPhone = await pool
      .request()
      .input("phoneNumber", sql.NVarChar, phoneNumber)
      .query("SELECT id FROM Users WHERE phoneNumber = @phoneNumber");

    if (existingPhone.recordset.length > 0) {
      sendApiError(res, req, 400, ApiErrors.phoneAlreadyRegistered);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Get Free plan ID by name (don't assume id=1)
    const freePlanResult = await pool
      .request()
      .query("SELECT id FROM Plans WHERE name = 'Free'");
    if (!freePlanResult.recordset.length) {
      logger.error("Free plan not found in Plans table");
      sendApiError(res, req, 500, ApiErrors.freePlanNotConfigured);
      return;
    }
    const freePlanId = freePlanResult.recordset[0].id;

    // Create user with email already verified (no email confirmation required)
    await executeTransaction(async (transaction) => {
      // Insert user with isEmailVerified = true
      const userResult = await transaction
        .request()
        .input("email", sql.NVarChar, email.toLowerCase())
        .input("password", sql.NVarChar, hashedPassword)
        .input("name", sql.NVarChar, name)
        .input("phoneNumber", sql.NVarChar, phoneNumber)
        .input("role", sql.NVarChar, ROLES.USER).query(`
          INSERT INTO Users (email, password, name, phoneNumber, role, isEmailVerified)
          OUTPUT INSERTED.id
          VALUES (@email, @password, @name, @phoneNumber, @role, 1)
        `);

      const userId = userResult.recordset[0].id;

      // Create free subscription (use Free plan ID from DB)
      await transaction
        .request()
        .input("userId", sql.Int, userId)
        .input("planId", sql.Int, freePlanId)
        .input("billingCycle", sql.NVarChar, "free").query(`
          INSERT INTO Subscriptions (userId, planId, billingCycle, status)
          VALUES (@userId, @planId, @billingCycle, 'active')
        `);

      // Note: Email verification is disabled for now
      // TODO: Re-enable email verification when email service is configured

      // Optionally send welcome email (non-blocking)
      try {
        sendWelcomeEmail(email, name, locale as "ar" | "en").catch(() => {
          logger.warn("Welcome email failed to send (non-critical)");
        });
      } catch (error) {
        // Ignore email errors - account is created successfully
      }
    });

    res.status(201).json({
      message: "Account created successfully! You can now login.",
    });
  } catch (error) {
    logger.error("Signup error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateAccount);
  }
}

// Login
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const ipAddress = (req.ip || req.socket.remoteAddress || "unknown").replace(
      "::ffff:",
      "",
    );
    const userAgent = req.headers["user-agent"];

    const pool = await getPool();

    // Check if account is locked
    const lockStatus = await LoginAttemptsService.isAccountLocked(email);
    if (lockStatus.isLocked) {
      const en = lockStatus.message || ApiErrors.accountTemporarilyLocked.en;
      sendApiError(
        res,
        req,
        403,
        { en, ar: ApiErrors.accountTemporarilyLocked.ar },
        { isLocked: true, lockedUntil: lockStatus.lockedUntil },
      );
      return;
    }

    // Get user
    const userResult = await pool
      .request()
      .input("email", sql.NVarChar, email.toLowerCase())
      .query("SELECT * FROM Users WHERE email = @email");

    if (userResult.recordset.length === 0) {
      // Record failed attempt
      await LoginAttemptsService.recordAttempt(
        email,
        ipAddress,
        false,
        userAgent,
      );
      await LoginAttemptsService.checkAndLockAccount(email);

      res.status(405).json({
        error:
          "البريد الإلكتروني غير مسجل في النظام. يرجى التحقق من البريد الإلكتروني والمحاولة مرة أخرى.",
        errorType: "EMAIL_NOT_FOUND",
      });
      return;
    }

    const user = userResult.recordset[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      // Record failed attempt
      await LoginAttemptsService.recordAttempt(
        email,
        ipAddress,
        false,
        userAgent,
      );
      const lockResult = await LoginAttemptsService.checkAndLockAccount(email);

      if (lockResult.shouldLock) {
        res.status(403).json({
          error:
            "تم قفل حسابك لمدة 30 دقيقة بسبب محاولات تسجيل دخول فاشلة متعددة.",
          isLocked: true,
          lockedUntil: lockResult.lockedUntil,
        });
      } else {
        res.status(405).json({
          error:
            "كلمة المرور غير صحيحة. يرجى التحقق من كلمة المرور والمحاولة مرة أخرى.",
          errorType: "INVALID_PASSWORD",
          remainingAttempts: lockResult.remainingAttempts,
        });
      }
      return;
    }

    // Check if account is suspended
    if (user.isSuspended) {
      sendApiError(
        res,
        req,
        403,
        {
          en: "This account has been suspended. Please contact support.",
          ar: "تم إيقاف هذا الحساب. برجاء التواصل مع الدعم.",
        },
        {
          isSuspended: true,
          suspendedReason:
            user.suspendedReason || "Account suspended by administrator",
        },
      );
      return;
    }

    // Note: Email verification check is disabled
    // TODO: Re-enable when email verification is required
    // if (!user.isEmailVerified) {
    //   res.status(403).json({
    //     error: 'Please verify your email before logging in',
    //     emailVerificationRequired: true,
    //   });
    //   return;
    // }

    // Update last login and reset failed attempts
    await pool
      .request()
      .input("userId", sql.Int, user.id)
      .query("UPDATE Users SET lastLoginAt = GETDATE() WHERE id = @userId");

    // Record successful login and reset failed attempts
    await LoginAttemptsService.recordAttempt(email, ipAddress, true, userAgent);
    await LoginAttemptsService.resetFailedAttempts(email);

    // Get user profile with subscription (same shape as getMe)
    const profileResult = await pool.request().input("userId", sql.Int, user.id)
      .query(`
        SELECT 
          u.id, u.email, u.name, u.role, u.phoneNumber, u.country,
          u.dateOfBirth, u.gender, u.address, u.profileImage,
          u.isEmailVerified, u.createdAt,
          s.planId, s.billingCycle, p.name as planName, p.maxMenus, p.maxProductsPerMenu
        FROM Users u
        LEFT JOIN Subscriptions s ON u.id = s.userId
          AND s.status = 'active'
          AND (s.endDate IS NULL OR s.endDate > GETDATE())
        LEFT JOIN Plans p ON s.planId = p.id
        WHERE u.id = @userId
      `);

    const profile = profileResult.recordset[0];
    const planType = profile?.billingCycle || "free";
    const subscription = {
      planId: profile?.planId ?? null,
      planName: profile?.planName ?? "Free",
      billingCycle: profile?.billingCycle ?? "free",
      maxMenus: profile?.maxMenus ?? 1,
      maxProductsPerMenu: profile?.maxProductsPerMenu ?? 50,
    };

    // Generate tokens
    const tokenPayload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store refresh token in database
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setFullYear(refreshTokenExpiry.getFullYear() + 100); // no expiry (100 years)
    await RefreshTokenService.storeToken(
      user.id,
      refreshToken,
      refreshTokenExpiry,
    );

    res.json({
      message: "Login successful",
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        phoneNumber: profile.phoneNumber,
        country: profile.country,
        dateOfBirth: profile.dateOfBirth,
        gender: profile.gender,
        address: profile.address,
        profileImage: profile.profileImage,
        isEmailVerified: profile.isEmailVerified,
        createdAt: profile.createdAt,
        planType,
        subscription,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error("Login error:", error);
    sendApiError(res, req, 500, ApiErrors.failedLogin);
  }
}

// Verify Email
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.query;

    if (!token) {
      sendApiError(res, req, 400, ApiErrors.tokenRequired);
      return;
    }

    const pool = await getPool();

    // Get verification record
    const verificationResult = await pool
      .request()
      .input("token", sql.NVarChar, token as string).query(`
        SELECT * FROM EmailVerifications 
        WHERE token = @token AND expiresAt > GETDATE()
      `);

    if (verificationResult.recordset.length === 0) {
      sendApiError(res, req, 400, ApiErrors.invalidVerificationToken);
      return;
    }

    const verification = verificationResult.recordset[0];

    // Update user and delete verification token
    await executeTransaction(async (transaction) => {
      await transaction.request().input("userId", sql.Int, verification.userId)
        .query(`
          UPDATE Users 
          SET isEmailVerified = 1, emailVerifiedAt = GETDATE()
          WHERE id = @userId
        `);

      await transaction
        .request()
        .input("token", sql.NVarChar, token as string)
        .query("DELETE FROM EmailVerifications WHERE token = @token");
    });

    res.json({ message: "Email verified successfully" });
  } catch (error) {
    logger.error("Email verification error:", error);
    sendApiError(res, req, 500, ApiErrors.failedVerifyEmail);
  }
}

// Resend Verification Email
export async function resendVerification(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { email, locale = "ar" } = req.body;

    const pool = await getPool();

    // Get user
    const userResult = await pool
      .request()
      .input("email", sql.NVarChar, email.toLowerCase())
      .query("SELECT * FROM Users WHERE email = @email");

    if (userResult.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }

    const user = userResult.recordset[0];

    if (user.isEmailVerified) {
      sendApiError(res, req, 400, ApiErrors.emailAlreadyVerified);
      return;
    }

    // Delete old tokens
    await pool
      .request()
      .input("userId", sql.Int, user.id)
      .query("DELETE FROM EmailVerifications WHERE userId = @userId");

    // Create new token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.EMAIL_VERIFICATION);

    await pool
      .request()
      .input("userId", sql.Int, user.id)
      .input("token", sql.NVarChar, token)
      .input("expiresAt", sql.DateTime2, expiresAt).query(`
        INSERT INTO EmailVerifications (userId, token, expiresAt)
        VALUES (@userId, @token, @expiresAt)
      `);

    // Send email
    await sendVerificationEmail(email, user.name, token, locale as "ar" | "en");

    res.json({ message: "Verification email sent" });
  } catch (error) {
    logger.error("Resend verification error:", error);
    sendApiError(res, req, 500, ApiErrors.failedResendVerification);
  }
}

// Forgot Password
export async function forgotPassword(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { email, locale = "ar" } = req.body;

    const pool = await getPool();

    // Get user
    const userResult = await pool
      .request()
      .input("email", sql.NVarChar, email.toLowerCase())
      .query("SELECT * FROM Users WHERE email = @email");

    if (userResult.recordset.length === 0) {
      // Don't reveal if email exists
      res.json({ message: "If the email exists, a reset link will be sent" });
      return;
    }

    const user = userResult.recordset[0];

    // Delete old password reset tokens for this user
    await pool
      .request()
      .input("userId", sql.Int, user.id)
      .query("DELETE FROM PasswordResets WHERE userId = @userId");

    // Create reset token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.PASSWORD_RESET);

    await pool
      .request()
      .input("userId", sql.Int, user.id)
      .input("token", sql.NVarChar, token)
      .input("expiresAt", sql.DateTime2, expiresAt).query(`
        INSERT INTO PasswordResets (userId, token, expiresAt)
        VALUES (@userId, @token, @expiresAt)
      `);

    // Send email
    await sendPasswordResetEmail(
      email,
      user.name,
      token,
      locale as "ar" | "en",
    );

    res.json({ message: "If the email exists, a reset link will be sent" });
  } catch (error) {
    logger.error("Forgot password error:", error);
    sendApiError(res, req, 500, ApiErrors.failedPasswordResetRequest);
  }
}

// Reset Password
export async function resetPassword(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { token, newPassword, locale = "ar" } = req.body;

    const pool = await getPool();

    // Get reset record
    const resetResult = await pool.request().input("token", sql.NVarChar, token)
      .query(`
        SELECT pr.*, u.email, u.name
        FROM PasswordResets pr
        JOIN Users u ON pr.userId = u.id
        WHERE pr.token = @token 
          AND pr.expiresAt > GETDATE()
          AND pr.isUsed = 0
      `);

    if (resetResult.recordset.length === 0) {
      sendApiError(res, req, 400, ApiErrors.invalidResetToken);
      return;
    }

    const reset = resetResult.recordset[0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and mark token as used
    await executeTransaction(async (transaction) => {
      await transaction
        .request()
        .input("userId", sql.Int, reset.userId)
        .input("password", sql.NVarChar, hashedPassword)
        .query("UPDATE Users SET password = @password WHERE id = @userId");

      await transaction
        .request()
        .input("token", sql.NVarChar, token)
        .query("UPDATE PasswordResets SET isUsed = 1 WHERE token = @token");
    });

    // Send confirmation email
    await sendPasswordChangedEmail(
      reset.email,
      reset.name,
      locale as "ar" | "en",
    );

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    logger.error("Reset password error:", error);
    sendApiError(res, req, 500, ApiErrors.failedResetPassword);
  }
}

// Get Current User
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const pool = await getPool();

    const userResult = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT 
          u.id, u.email, u.name, u.role, u.phoneNumber, u.country, 
          u.dateOfBirth, u.gender, u.address, u.profileImage,
          u.isEmailVerified, u.createdAt,
          s.planId, s.billingCycle, p.name as planName, p.maxMenus, p.maxProductsPerMenu
        FROM Users u
        LEFT JOIN Subscriptions s ON u.id = s.userId 
          AND s.status = 'active' 
          AND (s.endDate IS NULL OR s.endDate > GETDATE())
        LEFT JOIN Plans p ON s.planId = p.id
        WHERE u.id = @userId
      `);

    if (userResult.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }

    const user = userResult.recordset[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber,
        country: user.country,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        address: user.address,
        profileImage: user.profileImage,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        planType: user.billingCycle || "free", // Add planType from billingCycle
        subscription: {
          planId: user.planId,
          planName: user.planName,
          billingCycle: user.billingCycle,
          maxMenus: user.maxMenus,
          maxProductsPerMenu: user.maxProductsPerMenu,
        },
      },
    });
  } catch (error) {
    logger.error("Get me error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetUserData);
  }
}

/** Compare `{ fcmToken }` with `Users.fcmToken` for the authenticated user (no token echoed). */
export async function verifyFcmTokenMatch(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const raw = (req.body as { fcmToken?: unknown }).fcmToken;
    if (typeof raw !== "string" || !raw.trim()) {
      sendApiError(res, req, 400, ApiErrors.fcmTokenRequired);
      return;
    }
    const sent = raw.trim();
    if (sent.length > MAX_FCM_TOKEN_LEN) {
      sendApiError(res, req, 400, ApiErrors.invalidFcmTokenLength);
      return;
    }

    const tokens = await getUserFcmTokens(userId);
    const matches = tokens.includes(sent);

    res.json({ matches });
  } catch (error) {
    logger.error("Verify FCM token match error:", error);
    sendApiError(res, req, 500, ApiErrors.internalServerError);
  }
}

// Refresh Token
export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      sendApiError(res, req, 400, ApiErrors.refreshTokenRequired);
      return;
    }

    // Verify refresh token in database; follow replacement chain (e.g. double refresh)
    const MAX_CHAIN = 8;
    let tokenToUse = refreshToken;
    let tokenVerification = await RefreshTokenService.verifyToken(refreshToken);
    let chainSteps = 0;

    while (
      !tokenVerification.isValid &&
      tokenVerification.isRevoked &&
      tokenVerification.replacedByToken &&
      chainSteps < MAX_CHAIN
    ) {
      const nextVerification = await RefreshTokenService.verifyToken(
        tokenVerification.replacedByToken,
      );
      chainSteps++;
      tokenToUse = tokenVerification.replacedByToken;
      tokenVerification = nextVerification;
    }

    if (!tokenVerification.isValid) {
      sendApiError(
        res,
        req,
        401,
        tokenVerification.isRevoked
          ? ApiErrors.refreshTokenRevoked
          : ApiErrors.invalidRefreshToken,
      );
      return;
    }

    const pool = await getPool();

    // Verify JWT signature
    const { verifyRefreshToken } = require("../utils/tokenHelper");
    let decoded;
    try {
      decoded = verifyRefreshToken(tokenToUse);
    } catch (error) {
      sendApiError(res, req, 401, ApiErrors.invalidRefreshToken);
      return;
    }

    // Get user from database
    const userResult = await pool
      .request()
      .input("userId", sql.Int, decoded.userId)
      .query("SELECT * FROM Users WHERE id = @userId");

    if (userResult.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }

    const user = userResult.recordset[0];

    // Generate new tokens
    const tokenPayload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    // Rotate refresh token (revoke old, store new)
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setFullYear(refreshTokenExpiry.getFullYear() + 100); // no expiry (100 years)
    await RefreshTokenService.rotateToken(
      tokenToUse,
      newRefreshToken,
      refreshTokenExpiry,
    );

    res.json({
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    logger.error("Refresh token error:", error);
    sendApiError(res, req, 500, ApiErrors.failedRefreshToken);
  }
}

// Logout
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { refreshToken } = req.body;

    const rawFcm = (req.body as { fcmToken?: unknown }).fcmToken;
    if (rawFcm !== undefined && rawFcm !== null && rawFcm !== "") {
      if (typeof rawFcm !== "string") {
        sendApiError(res, req, 400, ApiErrors.validationFailed);
        return;
      }
      const sent = rawFcm.trim();
      if (sent.length > MAX_FCM_TOKEN_LEN) {
        sendApiError(res, req, 400, ApiErrors.invalidFcmTokenLength);
        return;
      }
      if (sent) {
        await removeUserFcmToken(userId, sent);
      }
    }

    // Get access token from header
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7); // Remove 'Bearer '

    if (accessToken) {
      // Add access token to blacklist
      const accessTokenExpiry = new Date();
      accessTokenExpiry.setMinutes(accessTokenExpiry.getMinutes() + 15); // Access token expires in 15 minutes
      await TokenBlacklistService.addToBlacklist(
        accessToken,
        userId,
        "access",
        accessTokenExpiry,
        "User logout",
      );
    }

    if (refreshToken) {
      // Revoke refresh token
      await RefreshTokenService.revokeToken(refreshToken, "User logout");
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout error:", error);
    sendApiError(res, req, 500, ApiErrors.failedLogout);
  }
}
