/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all restaurant owners
 *     description: |
 *       Paginated user list with search, plan filter, and aggregate stats.
 *       Used on the admin Users page.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, example: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "ahmed" }
 *       - in: query
 *         name: plan
 *         schema: { type: string, enum: [free, pro, all], example: all }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, lastLoginAt, name], example: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [ASC, DESC], example: DESC }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               users:
 *                 - id: 128
 *                   name: "Ahmed Hassan"
 *                   restaurantName: "مطعم الشام"
 *                   email: "owner@restaurant.com"
 *                   phoneNumber: "+201012345678"
 *                   planName: Pro
 *                   billingCycle: yearly
 *                   menusCount: 3
 *                   isSuspended: false
 *                   featuredOnHomepage: false
 *                   createdAt: "2025-01-15T10:00:00.000Z"
 *                   lastLoginAt: "2026-07-05T08:00:00.000Z"
 *               pagination:
 *                 currentPage: 1
 *                 totalPages: 63
 *                 totalItems: 1250
 *                 itemsPerPage: 20
 *               stats:
 *                 totalUsers: 1250
 *                 activeUsers: 1180
 *                 suspendedUsers: 12
 *                 freeUsers: 930
 *                 proUsers: 320
 *                 usersWithoutMenu: 85
 *                 usersOnHomepage: 12
 *
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: User details (full profile)
 *     description: User info, menus, subscription history, homepage feature status.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               user:
 *                 id: 128
 *                 name: "Ahmed Hassan"
 *                 email: "owner@restaurant.com"
 *                 planName: Pro
 *                 billingCycle: yearly
 *                 extraMenus: 2
 *                 effectiveMaxMenus: 7
 *                 accountStatus: active
 *                 isSuspended: false
 *                 isBlocked: false
 *               menus:
 *                 - id: 42
 *                   slug: "alsham-restaurant"
 *                   isActive: true
 *                   itemsCount: 85
 *               subscriptions:
 *                 - id: 301
 *                   planName: Pro
 *                   billingCycle: yearly
 *                   amount: 999
 *                   paymentStatus: completed
 *                   startDate: "2026-01-01T00:00:00.000Z"
 *                   endDate: "2027-01-01T00:00:00.000Z"
 *               featuredOnHomepage: false
 *               featuredMenuId: null
 *   delete:
 *     tags: [Admin]
 *     summary: Hard delete user
 *     description: Permanently removes user and all data. Irreversible.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "User deleted permanently"
 *
 * /api/admin/users/{id}/suspend:
 *   put:
 *     tags: [Admin]
 *     summary: Toggle user suspension
 *     description: Suspended users cannot log in. Optional reason in body.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             reason: "Payment dispute"
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               isSuspended: true
 *               suspendedReason: "Payment dispute"
 *
 * /api/admin/users/{id}/block:
 *   put:
 *     tags: [Admin]
 *     summary: Block or unblock user
 *     description: Block prevents login without deleting account.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             isBlocked: true
 *             reason: "Terms violation"
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/users/{id}/soft-delete:
 *   post:
 *     tags: [Admin]
 *     summary: Soft delete user
 *     description: Marks deletedAt. Can be restored with /restore.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               deletedAt: "2026-07-05T12:00:00.000Z"
 *
 * /api/admin/users/{id}/restore:
 *   post:
 *     tags: [Admin]
 *     summary: Restore soft-deleted user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *
 * /api/admin/users/{id}/password:
 *   put:
 *     tags: [Admin]
 *     summary: Set user password (admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             newPassword: "TempPass123"
 *     responses:
 *       200:
 *         description: Password updated
 *
 * /api/admin/users/{id}/send-reset-password:
 *   post:
 *     tags: [Admin]
 *     summary: Send password reset email
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Reset email sent"
 *
 * /api/admin/users/{id}/profile:
 *   put:
 *     tags: [Admin]
 *     summary: Patch user profile fields
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             name: "Ahmed Hassan"
 *             restaurantName: "مطعم الشام الجديد"
 *             phoneNumber: "+201012345678"
 *             country: "Egypt"
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/users/{id}/subscription:
 *   put:
 *     tags: [Admin]
 *     summary: Update user subscription
 *     description: Change plan, billing cycle, dates, or status manually.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             planId: 2
 *             billingCycle: yearly
 *             endDate: "2027-12-31T23:59:59.000Z"
 *             status: active
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               subscription:
 *                 planName: Pro
 *                 billingCycle: yearly
 *
 * /api/admin/users/{id}/extra-menus:
 *   put:
 *     tags: [Admin]
 *     summary: Set extra menus count
 *     description: Adds purchased menu slots beyond plan maxMenus.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             extraMenus: 3
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               extraMenus: 3
 *               effectiveMaxMenus: 8
 *
 * /api/admin/users/{id}/apply-free-limits:
 *   post:
 *     tags: [Admin]
 *     summary: Enforce Free plan limits
 *     description: Deactivates excess menus/items when downgrading to Free.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               menusDeactivated: 2
 *
 * /api/admin/users/{id}/feature-on-homepage:
 *   post:
 *     tags: [Admin]
 *     summary: Feature user logo on homepage
 *     description: Adds user's menu to Trusted By / featured logos section.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               featuredMenuId: 42
 *   delete:
 *     tags: [Admin]
 *     summary: Remove from homepage featured
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         description: Unfeatured
 *
 * /api/admin/users/{id}/addresses:
 *   get:
 *     tags: [Admin]
 *     summary: List user addresses
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               addresses:
 *                 - id: 1
 *                   label: "Main branch"
 *                   address: "15 Tahrir St, Cairo"
 *                   isDefault: true
 *   post:
 *     tags: [Admin]
 *     summary: Add user address
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             label: "Branch 2"
 *             address: "Smouha, Alexandria"
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/users/{id}/addresses/{addressId}:
 *   put:
 *     tags: [Admin]
 *     summary: Update user address
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Admin]
 *     summary: Delete user address
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/users/{id}/notes:
 *   get:
 *     tags: [Admin]
 *     summary: Internal admin notes on user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               notes:
 *                 - id: 10
 *                   content: "Called on July 1, interested in yearly Pro"
 *                   adminName: "Support Team"
 *                   createdAt: "2026-07-01T15:00:00.000Z"
 *   post:
 *     tags: [Admin]
 *     summary: Add admin note
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             content: "VIP customer, priority support"
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/users/{id}/notes/{noteId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete admin note
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { type: integer, example: 10 }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/users/{id}/activity-log:
 *   get:
 *     tags: [Admin]
 *     summary: User activity log
 *     description: Login, menu edits, subscription events for this user.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               logs:
 *                 - action: login
 *                   ip: "102.88.x.x"
 *                   createdAt: "2026-07-05T08:00:00.000Z"
 *
 * /api/admin/users/{id}/orders:
 *   get:
 *     tags: [Admin]
 *     summary: User payment orders
 *     description: EasyKash payment history for this user.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               orders:
 *                 - orderId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                   amount: 999
 *                   status: completed
 *                   paidAt: "2026-01-01T10:00:00.000Z"
 *
 * /api/admin/users/{id}/vouchers:
 *   get:
 *     tags: [Admin]
 *     summary: Vouchers assigned to user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               vouchers:
 *                 - id: 15
 *                   code: "PRO50OFF"
 *                   discountPercent: 50
 *                   isBlocked: false
 *                   redeemedAt: null
 *
 * /api/admin/users/{id}/vouchers/assign:
 *   post:
 *     tags: [Admin]
 *     summary: Assign voucher to user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             voucherId: 15
 *     responses:
 *       200:
 *         description: Assigned
 *
 * /api/admin/users/{id}/vouchers/{voucherId}/block:
 *   post:
 *     tags: [Admin]
 *     summary: Block voucher for user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema: { type: integer, example: 15 }
 *     responses:
 *       200:
 *         description: Blocked
 *   delete:
 *     tags: [Admin]
 *     summary: Unblock voucher for user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema: { type: integer, example: 15 }
 *     responses:
 *       200:
 *         description: Unblocked
 *
 * /api/admin/users/{id}/support:
 *   get:
 *     tags: [Admin]
 *     summary: Support cases for user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               cases:
 *                 - id: 8
 *                   subject: "Cannot upload logo"
 *                   status: open
 *                   createdAt: "2026-07-04T09:00:00.000Z"
 *   post:
 *     tags: [Admin]
 *     summary: Create support case
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             subject: "Billing issue"
 *             description: "Charged twice for yearly plan"
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/users/{id}/support/{caseId}:
 *   put:
 *     tags: [Admin]
 *     summary: Update support case status
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 128 }
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: integer, example: 8 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             status: resolved
 *             resolution: "Refunded duplicate charge"
 *     responses:
 *       200:
 *         description: Updated
 */

export {};
