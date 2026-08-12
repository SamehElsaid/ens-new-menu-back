/**
 * @openapi
 * /api/user/profile:
 *   get:
 *     tags: [User]
 *     summary: Get account profile
 *     description: |
 *       Returns the logged-in restaurant owner's profile.
 *       Includes delivery toggle, phone verification status, and FCM token flag.
 *       Subscription details are on GET /api/user/subscription.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profile loaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/UserProfile' }
 *             example:
 *               user:
 *                 id: 128
 *                 email: "owner@restaurant.com"
 *                 name: "Ahmed Hassan"
 *                 restaurantName: "مطعم الشام"
 *                 phoneNumber: "+201012345678"
 *                 deliveryPhone: "+201098765432"
 *                 deliveryOn: true
 *                 country: "Egypt"
 *                 gender: male
 *                 profileImage: "/uploads/profile-images/example.webp"
 *                 role: user
 *                 isEmailVerified: true
 *                 isPhoneVerified: false
 *                 phoneVerifiedAt: null
 *                 hasFcmToken: true
 *                 createdAt: "2025-01-15T10:00:00.000Z"
 *       404:
 *         description: User not found
 *
 *   put:
 *     tags: [User]
 *     summary: Update profile (JSON or multipart)
 *     description: |
 *       Partial update. Send JSON or multipart/form-data with optional profileImage file.
 *       Fields: name, restaurantName, phone/phoneNumber, country, dateOfBirth, gender,
 *       address, deliveryOn, deliveryPhone, fcmToken.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             name: "Ahmed Hassan"
 *             restaurantName: "مطعم الشام"
 *             phoneNumber: "+201012345678"
 *             country: "Egypt"
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               restaurantName: { type: string }
 *               profileImage: { type: string, format: binary }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Profile updated successfully"
 *               user:
 *                 id: 128
 *                 name: "Ahmed Hassan"
 *                 restaurantName: "مطعم الشام"
 *
 * /api/user/change-password:
 *   post:
 *     tags: [User]
 *     summary: Change password
 *     description: Requires current password. New password min 8 characters.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, example: "OldPass123" }
 *               newPassword: { type: string, minLength: 8, example: "NewSecure456" }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Password changed successfully"
 *       400:
 *         description: Wrong current password
 *
 * /api/user/statistics:
 *   get:
 *     tags: [User]
 *     summary: Dashboard statistics
 *     description: Aggregated counts for the owner's menus, items, and ratings.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               statistics:
 *                 totalMenus: 3
 *                 activeMenus: 2
 *                 totalItems: 145
 *                 totalRatings: 89
 *                 averageRating: 4.6
 *
 * /api/user/plans:
 *   get:
 *     tags: [User]
 *     summary: Available plans with personalized pricing
 *     description: |
 *       Active subscription plans with intro/discount pricing for the logged-in user,
 *       including `capabilities` and marketing-only `customDisplay`.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               plans:
 *                 - id: 1
 *                   name: Free
 *                   priceMonthly: 0
 *                   maxMenus: 1
 *                   capabilities:
 *                     aiMenuImport: true
 *                     tableOrderingQr: false
 *                     staffAndTables: false
 *                     maxAdsPerMenu: 1
 *                 - id: 2
 *                   name: Pro
 *                   priceMonthly: 99
 *                   maxMenus: 5
 *                   capabilities:
 *                     tableOrderingQr: true
 *                     staffAndTables: true
 *                     maxAdsPerMenu: -1
 *               customDisplay:
 *                 advancedDeliveryMaps: true
 *                 maxAdsPerMenu: -1
 *                 allowedThemes: [default, coffee, neon, sky, waffle, vanilla]
 *
 * /api/user/subscription:
 *   get:
 *     tags: [User]
 *     summary: Current subscription
 *     description: |
 *       Active plan, menu limits, extra menus, renewal dates, and grace period info.
 *       Free users get effectiveMaxMenus from the Free plan.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription: { $ref: '#/components/schemas/UserSubscription' }
 *             example:
 *               subscription:
 *                 plan: Pro
 *                 planName: Pro
 *                 status: active
 *                 billingCycle: yearly
 *                 startDate: "2026-01-01T00:00:00.000Z"
 *                 endDate: "2027-01-01T00:00:00.000Z"
 *                 amount: 999
 *                 maxMenus: 5
 *                 extraMenus: 2
 *                 effectiveMaxMenus: 7
 *                 extraMenuPrice: 150
 *                 subscriptionDaysRemaining: 180
 *                 canRenewPro: false
 *                 isInGracePeriod: false
 *
 * /api/user/subscription/recover-payment:
 *   post:
 *     tags: [User]
 *     summary: Complete pending Pro payment
 *     description: |
 *       Retries activation when a Pro payment was initiated but subscription not yet active.
 *       Looks up the latest pending EasyKash order for the user.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Subscription recovery attempted"
 *               orderId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *       404:
 *         description: No pending payment found
 *
 * /api/user/subscription/downgrade-to-free:
 *   post:
 *     tags: [User]
 *     summary: Downgrade to Free plan
 *     description: |
 *       Self-service downgrade from Pro. Ends current paid subscription and creates Free plan.
 *       Pro-only features (tables, staff, distance delivery) stop working after downgrade.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Downgraded to Free plan successfully"
 *               planName: Free
 *
 * /api/user/upgrade-plan:
 *   post:
 *     tags: [User]
 *     summary: Upgrade subscription plan
 *     description: |
 *       Legacy/direct upgrade without payment gateway (admin or internal use).
 *       For paid upgrades use POST /api/payment/initiate instead.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planType]
 *             properties:
 *               planType: { type: string, enum: [free, monthly, yearly], example: yearly }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Plan upgraded successfully"
 *               planType: yearly
 *               menusLimit: 5
 *
 * /api/user/fcm-token:
 *   post:
 *     tags: [User]
 *     summary: Register FCM push token
 *     description: Stores Firebase Cloud Messaging token for mobile/web push notifications.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             fcmToken: "dGhpcyBpcyBhIGZha2UgZmNtIHRva2Vu..."
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "FCM token registered"
 *
 * /api/user/fcm-token/status:
 *   get:
 *     tags: [User]
 *     summary: FCM token registration status
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               hasFcmToken: true
 *               registeredAt: "2026-07-01T08:00:00.000Z"
 *
 * /api/user/notifications:
 *   get:
 *     tags: [User]
 *     summary: List in-app notifications
 *     description: Paginated notifications (subscription, system alerts, etc.).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, example: 20 }
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean, example: false }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               notifications:
 *                 - id: 101
 *                   title: "Subscription renewed"
 *                   titleAr: "تم تجديد الاشتراك"
 *                   body: "Your Pro plan is active until Jan 2027"
 *                   isRead: false
 *                   createdAt: "2026-07-05T10:00:00.000Z"
 *               pagination:
 *                 total: 15
 *                 page: 1
 *                 limit: 20
 *
 * /api/user/notifications/{id}/read:
 *   patch:
 *     tags: [User]
 *     summary: Mark notification as read
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 101 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *
 * /api/user/notifications/read-all:
 *   post:
 *     tags: [User]
 *     summary: Mark all notifications read
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               markedCount: 5
 *
 * /api/user/notifications/{id}:
 *   delete:
 *     tags: [User]
 *     summary: Delete notification
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 101 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *
 * /api/user/domain-transfer:
 *   get:
 *     tags: [User]
 *     summary: Get domain transfer request
 *     description: |
 *       Custom domain migration workflow. User requests moving their menu to their own domain.
 *       Returns current request plus message history.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               request:
 *                 id: 5
 *                 domainUrl: "https://myrestaurant.com"
 *                 status: in_progress
 *               history:
 *                 - id: 12
 *                   message: "DNS records verified"
 *                   sender: admin
 *                   createdAt: "2026-07-03T14:00:00.000Z"
 *       404:
 *         description: No active request
 *
 *   post:
 *     tags: [User]
 *     summary: Create domain transfer request
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [domainUrl]
 *             properties:
 *               domainUrl: { type: string, example: "https://myrestaurant.com" }
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             example:
 *               request:
 *                 id: 5
 *                 domainUrl: "https://myrestaurant.com"
 *                 status: pending
 *
 * /api/user/domain-transfer/{id}/confirm:
 *   post:
 *     tags: [User]
 *     summary: Confirm domain transfer step
 *     description: User confirms they completed a pending step (e.g. DNS setup).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 5 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               request:
 *                 id: 5
 *                 status: in_progress
 *
 * /api/user/domain-transfer/{id}/cancel:
 *   post:
 *     tags: [User]
 *     summary: Cancel domain transfer request
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 5 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *
 * /api/user/account:
 *   delete:
 *     tags: [User]
 *     summary: Delete account permanently
 *     description: >
 *       Permanently deletes the authenticated user and associated data.
 *       `password` is required only for email/password accounts (when Users.password is set).
 *       Google/Apple-only accounts can omit it; the Bearer JWT from requireAuth is sufficient.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 example: "MyPassword123"
 *                 description: Required only for email/password accounts
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Account deleted successfully"
 *       400:
 *         description: Password required for email/password accounts (passwordRequired)
 *       401:
 *         description: Invalid password
 */

export {};
