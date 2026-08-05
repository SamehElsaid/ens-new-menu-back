/**
 * @openapi
 * /api/auth/check-availability:
 *   get:
 *     tags: [Auth]
 *     summary: Check email/phone availability
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: email
 *         schema: { type: string, format: email }
 *       - in: query
 *         name: phoneNumber
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Availability result
 *
 * /api/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               name: { type: string }
 *               phoneNumber: { type: string }
 *               locale: { type: string, enum: [ar, en] }
 *     responses:
 *       201:
 *         description: User created
 *
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Returns access & refresh tokens
 *
 * /api/auth/verify-email:
 *   get:
 *     tags: [Auth]
 *     summary: Verify email via token
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Email verified
 *
 * /api/auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend verification email
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *               locale: { type: string, enum: [ar, en] }
 *     responses:
 *       200:
 *         description: Email sent
 *
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *               locale: { type: string, enum: [ar, en] }
 *     responses:
 *       200:
 *         description: Reset email sent
 *
 * /api/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with token
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password updated
 *
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: User profile
 *
 * /api/auth/me/fcm-token-match:
 *   post:
 *     tags: [Auth]
 *     summary: Verify FCM token matches stored token
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fcmToken]
 *             properties:
 *               fcmToken: { type: string }
 *     responses:
 *       200:
 *         description: Match result
 *
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New tokens
 *
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout (revoke tokens)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Logged out
 *
 * /api/auth/google:
 *   post:
 *     tags: [Google Auth]
 *     summary: Authenticate with Google
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token: { type: string }
 *               access_token: { type: string }
 *               code: { type: string }
 *               redirect_uri: { type: string }
 *               locale: { type: string, enum: [ar, en] }
 *     responses:
 *       200:
 *         description: Authenticated
 *
 * /api/auth/google/config:
 *   get:
 *     tags: [Google Auth]
 *     summary: Get Google OAuth client config
 *     responses:
 *       200:
 *         description: Google config
 *
 * /api/auth/apple:
 *   post:
 *     tags: [Apple Auth]
 *     summary: Authenticate with Apple (identityToken)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identityToken]
 *             properties:
 *               identityToken: { type: string, description: Apple identity JWT }
 *               token: { type: string, description: Alias for identityToken }
 *               email: { type: string, format: email, description: Fallback email (first sign-in) }
 *               name:
 *                 type: object
 *                 properties:
 *                   firstName: { type: string }
 *                   lastName: { type: string }
 *               locale: { type: string, enum: [ar, en] }
 *     responses:
 *       200:
 *         description: Authenticated
 *
 * /api/auth/apple/config:
 *   get:
 *     tags: [Apple Auth]
 *     summary: Get Apple Sign In client config
 *     responses:
 *       200:
 *         description: Apple config
 *
 * /api/auth/apple/notifications:
 *   post:
 *     tags: [Apple Auth]
 *     summary: Apple Server-to-Server notifications webhook
 *     description: Absolute HTTPS URL to paste in Apple Developer Console (App ID → Sign in with Apple → Server-to-Server Notification Endpoint)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payload: { type: string, description: Apple-signed JWT }
 *     responses:
 *       200:
 *         description: Received
 */

export {};
