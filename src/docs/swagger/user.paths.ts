/**
 * @openapi
 * /api/user/fcm-token:
 *   post:
 *     tags: [User]
 *     summary: Register FCM push token
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Token registered
 *
 * /api/user/fcm-token/status:
 *   get:
 *     tags: [User]
 *     summary: FCM token status
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Status
 *
 * /api/user/notifications:
 *   get:
 *     tags: [User]
 *     summary: List notifications
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Notifications
 *
 * /api/user/notifications/{id}/read:
 *   patch:
 *     tags: [User]
 *     summary: Mark notification read
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Marked read
 *
 * /api/user/notifications/read-all:
 *   post:
 *     tags: [User]
 *     summary: Mark all notifications read
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All marked
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
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/user/profile:
 *   get:
 *     tags: [User]
 *     summary: Get profile
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profile
 *   put:
 *     tags: [User]
 *     summary: Update profile (JSON or multipart)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/user/delivery/settings:
 *   get:
 *     tags: [User]
 *     summary: User delivery settings
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Settings
 *   put:
 *     tags: [User]
 *     summary: Update delivery settings
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/user/delivery/governorates:
 *   get:
 *     tags: [User]
 *     summary: List user delivery governorates
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Governorates
 *   post:
 *     tags: [User]
 *     summary: Create governorate
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/user/delivery/governorates/{governorateId}:
 *   put:
 *     tags: [User]
 *     summary: Update governorate
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: governorateId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [User]
 *     summary: Delete governorate
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: governorateId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/user/change-password:
 *   post:
 *     tags: [User]
 *     summary: Change password
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password changed
 *
 * /api/user/statistics:
 *   get:
 *     tags: [User]
 *     summary: User statistics
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Stats
 *
 * /api/user/plans:
 *   get:
 *     tags: [User]
 *     summary: Plans with personalized pricing
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Plans
 *
 * /api/user/subscription:
 *   get:
 *     tags: [User]
 *     summary: Current subscription
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Subscription
 *
 * /api/user/subscription/recover-payment:
 *   post:
 *     tags: [User]
 *     summary: Complete pending Pro payment
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Recovered
 *
 * /api/user/subscription/downgrade-to-free:
 *   post:
 *     tags: [User]
 *     summary: Downgrade to Free plan
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Downgraded
 *
 * /api/user/upgrade-plan:
 *   post:
 *     tags: [User]
 *     summary: Upgrade subscription plan
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planType]
 *             properties:
 *               planType: { type: string, enum: [free, monthly, yearly] }
 *     responses:
 *       200:
 *         description: Upgraded
 *
 * /api/user/domain-transfer:
 *   get:
 *     tags: [User]
 *     summary: Get domain transfer request
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Transfer request
 *   post:
 *     tags: [User]
 *     summary: Create domain transfer request
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [domainUrl]
 *             properties:
 *               domainUrl: { type: string }
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/user/domain-transfer/{id}/confirm:
 *   post:
 *     tags: [User]
 *     summary: Confirm domain transfer
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Confirmed
 *
 * /api/user/domain-transfer/{id}/cancel:
 *   post:
 *     tags: [User]
 *     summary: Cancel domain transfer
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Cancelled
 *
 * /api/user/account:
 *   delete:
 *     tags: [User]
 *     summary: Delete account
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Account deleted
 */

export {};
