/**
 * @openapi
 * /api/admin/plans/subscription:
 *   get:
 *     tags: [Admin]
 *     summary: Plans for subscription admin UI
 *     description: Active plans formatted for assigning subscriptions to users.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               plans:
 *                 - id: 1
 *                   name: Free
 *                   maxMenus: 1
 *                   maxProductsPerMenu: -1
 *                 - id: 2
 *                   name: Pro
 *                   maxMenus: 5
 *                   monthlyPrice: 99
 *                   yearlyPrice: 999
 *
 * /api/admin/plans/custom-display:
 *   get:
 *     tags: [Admin]
 *     summary: Custom plan marketing display settings
 *     description: |
 *       Display-only capabilities for the Pricing "Custom" column (not enforced at runtime).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               capabilities:
 *                 aiMenuImport: true
 *                 tableOrderingQr: true
 *                 liveOrderNotifications: true
 *                 staffAndTables: true
 *                 advancedDeliveryMaps: true
 *                 maxAdsPerMenu: -1
 *                 allowedThemes: [default, coffee, neon, sky, waffle, vanilla, onecard]
 *   put:
 *     tags: [Admin]
 *     summary: Update Custom plan marketing display
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             capabilities:
 *               aiMenuImport: true
 *               tableOrderingQr: true
 *               liveOrderNotifications: true
 *               staffAndTables: true
 *               advancedDeliveryMaps: true
 *               maxAdsPerMenu: -1
 *               allowedThemes: [default, coffee, neon, sky, waffle, vanilla]
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/plans:
 *   get:
 *     tags: [Admin]
 *     summary: All subscription plans
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               plans:
 *                 - id: 2
 *                   name: Pro
 *                   maxMenus: 5
 *                   maxProductsPerMenu: -1
 *                   monthlyPrice: 99
 *                   yearlyPrice: 999
 *                   isActive: true
 *                   capabilities:
 *                     aiMenuImport: true
 *                     tableOrderingQr: true
 *                     liveOrderNotifications: true
 *                     staffAndTables: true
 *                     advancedDeliveryMaps: true
 *                     maxAdsPerMenu: -1
 *                     allowedThemes: [default, coffee, neon, sky, waffle, vanilla]
 *   post:
 *     tags: [Admin]
 *     summary: Create subscription plan
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             name: Pro Plus
 *             maxMenus: 10
 *             maxProductsPerMenu: -1
 *             monthlyPrice: 149
 *             yearlyPrice: 1499
 *             capabilities:
 *               aiMenuImport: true
 *               tableOrderingQr: true
 *               staffAndTables: true
 *               liveOrderNotifications: true
 *               advancedDeliveryMaps: true
 *               maxAdsPerMenu: -1
 *               allowedThemes: [default, coffee, neon]
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/plans/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Update plan (full)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 2 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             name: Pro
 *             yearlyPrice: 1099
 *             isActive: true
 *             capabilities:
 *               aiMenuImport: true
 *               tableOrderingQr: true
 *               liveOrderNotifications: true
 *               staffAndTables: true
 *               advancedDeliveryMaps: true
 *               maxAdsPerMenu: -1
 *               allowedThemes: [default, coffee, neon, sky, waffle, vanilla]
 *     responses:
 *       200:
 *         description: Updated
 *   patch:
 *     tags: [Admin]
 *     summary: Partial update plan
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 2 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             yearlyPrice: 1099
 *             capabilities:
 *               maxAdsPerMenu: 3
 *     responses:
 *       200:
 *         description: Patched
 *
 * /api/admin/admins:
 *   get:
 *     tags: [Admin]
 *     summary: List admin accounts
 *     description: Platform admins with permissions. Super-admin only for create/delete.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               admins:
 *                 - id: 1
 *                   name: "Super Admin"
 *                   email: "admin@ensmenu.com"
 *                   permissions:
 *                     users: true
 *                     plans: true
 *                     broadcast: true
 *                   lastLoginAt: "2026-07-05T09:00:00.000Z"
 *               statistics:
 *                 totalAdmins: 3
 *   post:
 *     tags: [Admin]
 *     summary: Create admin account
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             name: "Support Admin"
 *             email: "support@ensmenu.com"
 *             password: "SecureAdmin123"
 *             permissions:
 *               users: true
 *               followUps: true
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/admins/{id}/permissions:
 *   patch:
 *     tags: [Admin]
 *     summary: Update admin permissions
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 2 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             permissions:
 *               users: true
 *               plans: false
 *               vouchers: true
 *               broadcast: false
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/admins/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete admin account
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 2 }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/app-version:
 *   post:
 *     tags: [Admin]
 *     summary: Publish mobile app version
 *     description: Forces app update prompt when minVersion exceeds client version.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             platform: android
 *             minVersion: "2.5.0"
 *             latestVersion: "2.6.1"
 *             forceUpdate: true
 *             storeUrl: "https://play.google.com/store/apps/details?id=com.ensmenu"
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               id: 12
 *
 * /api/admin/vouchers:
 *   get:
 *     tags: [Admin]
 *     summary: List discount vouchers
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               vouchers:
 *                 - id: 15
 *                   code: "PRO50OFF"
 *                   discountPercent: 50
 *                   maxUses: 100
 *                   usedCount: 23
 *                   expiresAt: "2026-12-31T23:59:59.000Z"
 *                   isActive: true
 *   post:
 *     tags: [Admin]
 *     summary: Create voucher
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             code: "SUMMER2026"
 *             discountPercent: 30
 *             maxUses: 500
 *             expiresAt: "2026-09-30T23:59:59.000Z"
 *             applicablePlans: [yearly]
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/vouchers/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get voucher details
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 15 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               voucher:
 *                 id: 15
 *                 code: "PRO50OFF"
 *                 discountPercent: 50
 *                 usedCount: 23
 *   patch:
 *     tags: [Admin]
 *     summary: Update voucher
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 15 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             isActive: false
 *             maxUses: 200
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Admin]
 *     summary: Delete voucher
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 15 }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/vouchers/{id}/redemptions:
 *   get:
 *     tags: [Admin]
 *     summary: Voucher redemption history
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 15 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               redemptions:
 *                 - userId: 128
 *                   userName: "Ahmed Hassan"
 *                   redeemedAt: "2026-06-10T14:00:00.000Z"
 *                   orderAmount: 999
 *                   discountApplied: 499.5
 */

export {};
