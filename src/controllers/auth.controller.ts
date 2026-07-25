import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getPool, sql, executeTransaction } from "../config/database";
import {
  generateAccessToken,
  generateRefreshToken,
  generateStaffAccessToken,
} from "../utils/tokenHelper";
import {
  getMenuStaffColumnMeta,
  getStaffIsActive,
  getStaffPasswordHash,
  normalizeStaffRow,
  quoteMenuStaffIdent,
} from "../config/menuStaffColumns";
import {
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
import { getAuthUserProfile } from "../services/userProfile.service";
import { ensureRestaurantNameSchema } from "../schemas/restaurantName.schema";
import {
  getUserFcmTokens,
  MAX_FCM_TOKEN_LEN,
  removeUserFcmToken,
} from "../services/fcmPush.service";
import { localizedRoleNameSql } from "../services/menuStaffRoles.service";
import { getLocaleFromAcceptLanguage } from "../utils/localeHelper";

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
    const { email, password, name, phoneNumber, restaurantName, locale = "ar" } =
      req.body;

    // Validate required fields
    if (!phoneNumber) {
      sendApiError(res, req, 400, ApiErrors.phoneRequired);
      return;
    }

    await ensureRestaurantNameSchema();
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

    const verificationToken = uuidv4();
    const verificationExpiresAt = new Date(
      Date.now() + TOKEN_EXPIRY.EMAIL_VERIFICATION,
    );

    await executeTransaction(async (transaction) => {
      const userResult = await transaction
        .request()
        .input("email", sql.NVarChar, email.toLowerCase())
        .input("password", sql.NVarChar, hashedPassword)
        .input("name", sql.NVarChar, name)
        .input("phoneNumber", sql.NVarChar, phoneNumber)
        .input("restaurantName", sql.NVarChar, restaurantName ?? null)
        .input("role", sql.NVarChar, ROLES.USER)
        .input("isEmailVerified", sql.Bit, 0)
        .query(`
          INSERT INTO Users (email, password, name, phoneNumber, restaurantName, role, isEmailVerified, emailVerifiedAt)
          OUTPUT INSERTED.id
          VALUES (@email, @password, @name, @phoneNumber, @restaurantName, @role, @isEmailVerified,
                  CASE WHEN @isEmailVerified = 1 THEN GETDATE() ELSE NULL END)
        `);

      const userId = userResult.recordset[0].id;

      await transaction
        .request()
        .input("userId", sql.Int, userId)
        .input("planId", sql.Int, freePlanId)
        .input("billingCycle", sql.NVarChar, "free").query(`
          INSERT INTO Subscriptions (userId, planId, billingCycle, status, paymentStatus, paidAt, amount)
          VALUES (@userId, @planId, @billingCycle, 'active', 'completed', GETDATE(), 0)
        `);

      await transaction
        .request()
        .input("userId", sql.Int, userId)
        .input("token", sql.NVarChar, verificationToken)
        .input("expiresAt", sql.DateTime2, verificationExpiresAt).query(`
          INSERT INTO EmailVerifications (userId, token, expiresAt)
          VALUES (@userId, @token, @expiresAt)
        `);
    });

    try {
      const sent = await sendVerificationEmail(
        email,
        name,
        verificationToken,
        locale as "ar" | "en",
      );
      if (!sent) {
        logger.warn(`Verification email was not sent to ${email}`);
      }
    } catch (error) {
      logger.warn("Verification email failed to send (non-critical)", error);
    }

    res.status(201).json({
      message:
        locale === "en"
          ? "Account created! You can log in now. Please check your email to verify your address."
          : "تم إنشاء الحساب! يمكنك تسجيل الدخول الآن. تحقق من بريدك لتأكيد عنوانك.",
      emailVerificationRequired: false,
    });
  } catch (error) {
    logger.error("Signup error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateAccount);
  }
}

// Login
function parseStaffRolePermissions(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/**
 * Dashboard login for staff. Every staff member may sign in here regardless of
 * their role — what they can see and do is decided by the role's permissions
 * and their menu grants. Returns true when it has written a response (success
 * or a staff-specific error), and false to let the caller fall back to the
 * normal Users login error.
 *
 * Staff ids do not exist in `Users`, so (like the staff app) we issue a
 * non-expiring staff access token and do not persist a refresh token.
 */
async function tryDashboardStaffLogin(
  req: Request,
  res: Response,
  email: string,
  password: string,
): Promise<boolean> {
  const pool = await getPool();
  const staffMeta = await getMenuStaffColumnMeta();
  if (!staffMeta.emailKey || !staffMeta.passwordKey) return false;

  const emailCol = quoteMenuStaffIdent(staffMeta.emailKey);
  const staffResult = await pool
    .request()
    .input("email", sql.NVarChar, email.toLowerCase().trim())
    .input("locale", sql.NVarChar(5), getLocaleFromAcceptLanguage(req)).query(`
      SELECT
        s.*,
        ${localizedRoleNameSql("sr", "staffRoleName")},
        sr.permissionsJson as staffRolePermissions,
        m.id as menuTableId,
        m.uuid as menuUuid,
        m.userId as menuOwnerUserId,
        m.slug as menuSlug,
        m.logo as menuLogo,
        m.theme as menuTheme,
        m.isActive as menuIsActive,
        ISNULL(m.currency, 'SAR') as menuCurrency,
        ar.name as menuNameAr,
        en.name as menuNameEn
      FROM MenuStaff s
      JOIN Menus m ON s.menuId = m.id
      LEFT JOIN MenuStaffRoles sr ON sr.id = s.roleId
      LEFT JOIN MenuTranslations ar ON m.id = ar.menuId AND ar.locale = 'ar'
      LEFT JOIN MenuTranslations en ON m.id = en.menuId AND en.locale = 'en'
      WHERE ${emailCol} = @email
    `);

  if (staffResult.recordset.length === 0) return false;

  let matchedRow: Record<string, unknown> | null = null;
  for (const row of staffResult.recordset) {
    const staff = row as Record<string, unknown>;
    const storedHash = getStaffPasswordHash(staff, staffMeta);
    if (!storedHash) continue;
    if (!(await bcrypt.compare(password, storedHash))) continue;
    matchedRow = staff;
  }
  if (!matchedRow) return false;

  const staff = matchedRow;

  if (!getStaffIsActive(staff, staffMeta)) {
    sendApiError(res, req, 403, {
      en: "Your account is deactivated. Contact the restaurant manager.",
      ar: "تم إيقاف حسابك. تواصل مع إدارة المطعم.",
    });
    return true;
  }

  if (!staff.menuIsActive) {
    sendApiError(res, req, 403, {
      en: "This restaurant is currently inactive",
      ar: "هذا المطعم غير مفعل حالياً",
    });
    return true;
  }

  const norm = normalizeStaffRow(staff, staffMeta);
  const staffRoleId = norm.roleId != null ? Number(norm.roleId) : null;
  const staffRoleName =
    staff.staffRoleName != null ? String(staff.staffRoleName) : null;
  const permissions = parseStaffRolePermissions(staff.staffRolePermissions);

  const ownerUserId =
    norm.ownerUserId != null
      ? Number(norm.ownerUserId)
      : staff.menuOwnerUserId != null
        ? Number(staff.menuOwnerUserId)
        : undefined;

  const tokenPayload = {
    id: staff.id as number,
    userId: staff.id as number,
    email: norm.email as string,
    role: ROLES.STAFF,
    menuId: norm.menuId != null ? Number(norm.menuId) : undefined,
    ownerUserId,
    staffRoleId: staffRoleId ?? undefined,
  };

  const accessToken = generateStaffAccessToken(tokenPayload);

  res.json({
    message: "Login successful",
    user: {
      id: staff.id,
      email: norm.email,
      name: norm.name,
      restaurantName: staff.menuNameAr ?? staff.menuNameEn ?? null,
      role: ROLES.STAFF,
      isStaff: true,
      menuId: norm.menuId,
      roleId: staffRoleId,
      roleName: staffRoleName,
      permissions,
    },
    staff: {
      id: norm.id,
      name: norm.name,
      email: norm.email,
      roleId: staffRoleId,
      roleName: staffRoleName,
      menuId: norm.menuId,
    },
    role:
      staffRoleId != null ? { id: staffRoleId, name: staffRoleName } : null,
    permissions,
    menu: {
      id: staff.menuTableId,
      uuid: staff.menuUuid,
      userId: staff.menuOwnerUserId,
      slug: staff.menuSlug,
      logo: staff.menuLogo,
      theme: staff.menuTheme,
      isActive: staff.menuIsActive,
      currency: staff.menuCurrency,
      nameAr: staff.menuNameAr,
      nameEn: staff.menuNameEn,
    },
    accessToken,
    refreshToken: null,
  });
  return true;
}

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
      // No owner account with this email — try a dashboard-portal staff login
      // (cashier / accountant / manager) before failing.
      const handledAsStaff = await tryDashboardStaffLogin(
        req,
        res,
        email,
        password,
      );
      if (handledAsStaff) {
        await LoginAttemptsService.recordAttempt(
          email,
          ipAddress,
          true,
          userAgent,
        );
        await LoginAttemptsService.resetFailedAttempts(email);
        return;
      }

      // Record failed attempt
      await LoginAttemptsService.recordAttempt(
        email,
        ipAddress,
        false,
        userAgent,
      );
      await LoginAttemptsService.checkAndLockAccount(email);

      res.status(401).json({
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
        res.status(401).json({
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
          u.id, u.email, u.name, u.restaurantName, u.role, u.phoneNumber, u.country,
          u.dateOfBirth, u.gender, u.address, u.profileImage,
          u.isEmailVerified, u.isPhoneVerified, u.phoneVerifiedAt, u.createdAt,
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
      maxProductsPerMenu: profile?.maxProductsPerMenu ?? -1,
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
        restaurantName: profile.restaurantName ?? null,
        role: profile.role,
        phoneNumber: profile.phoneNumber,
        country: profile.country,
        dateOfBirth: profile.dateOfBirth,
        gender: profile.gender,
        address: profile.address,
        profileImage: profile.profileImage,
        isEmailVerified: profile.isEmailVerified,
        isPhoneVerified: Boolean(profile.isPhoneVerified),
        phoneVerifiedAt: profile.phoneVerifiedAt ?? null,
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

    const emailSent = await sendVerificationEmail(
      email,
      user.name,
      token,
      locale as "ar" | "en",
    );
    if (!emailSent) {
      sendApiError(res, req, 500, ApiErrors.failedResendVerification);
      return;
    }

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

    const emailSent = await sendPasswordResetEmail(
      email,
      user.name,
      token,
      locale as "ar" | "en",
    );
    if (!emailSent) {
      sendApiError(res, req, 500, ApiErrors.failedPasswordResetRequest);
      return;
    }

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
    const user = await getAuthUserProfile(userId);
    res.json({ user });
  } catch (error) {
    if (error instanceof Error && error.message === "User not found") {
      sendApiError(res, req, 404, ApiErrors.userNotFound);
      return;
    }
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

      // TokenBlacklist.userId has an FK to Users.id. Dashboard staff sign in
      // through this endpoint but their id comes from MenuStaff and may not
      // exist in Users, so only blacklist when a matching Users row exists to
      // avoid the FK violation breaking an otherwise valid logout.
      const pool = await getPool();
      const userExists = await pool
        .request()
        .input("userId", sql.Int, userId)
        .query("SELECT TOP 1 id FROM Users WHERE id = @userId");

      if (userExists.recordset.length > 0) {
        await TokenBlacklistService.addToBlacklist(
          accessToken,
          userId,
          "access",
          accessTokenExpiry,
          "User logout",
        );
      } else {
        logger.warn(
          "Skipping access-token blacklist: no matching Users row",
          { userId },
        );
      }
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
