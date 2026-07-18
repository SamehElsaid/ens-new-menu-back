/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard KPIs and charts
 *     description: |
 *       Main admin home page metrics: users, revenue, plan distribution.
 *       Requires admin JWT (role admin).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               stats:
 *                 totalUsers: 1250
 *                 activeAccounts: 1180
 *                 paidPlans: 320
 *                 trialUsers: 45
 *                 monthlyRevenue: 48500
 *                 suspendedAccounts: 12
 *               charts:
 *                 usersGrowth:
 *                   - month: "2026-01"
 *                     count: 85
 *                 revenueGrowth:
 *                   - month: "2026-06"
 *                     revenue: 48500
 *                 plansDistribution:
 *                   - name: Pro
 *                     count: 320
 *
 * /api/admin/analytics:
 *   get:
 *     tags: [Admin]
 *     summary: Extended analytics
 *     description: Deeper metrics for reports (menus, views, conversions).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [7d, 30d, 90d, 1y], example: 30d }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               period: 30d
 *               totalMenuViews: 125000
 *               newUsers: 85
 *               proConversions: 12
 *
 * /api/admin/payments:
 *   get:
 *     tags: [Admin]
 *     summary: Payment records
 *     description: EasyKash subscription payments with filters and pagination.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [completed, pending, failed], example: completed }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               payments:
 *                 - id: 501
 *                   userId: 128
 *                   userName: "Ahmed Hassan"
 *                   amount: 999
 *                   billingCycle: yearly
 *                   paymentStatus: completed
 *                   paidAt: "2026-06-15T10:00:00.000Z"
 *               pagination:
 *                 currentPage: 1
 *                 totalItems: 320
 *
 * /api/admin/domain-transfers:
 *   get:
 *     tags: [Admin]
 *     summary: List domain transfer requests
 *     description: All custom-domain migration requests from restaurant owners.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, in_progress, completed, cancelled] }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               requests:
 *                 - id: 5
 *                   userId: 128
 *                   userName: "Ahmed Hassan"
 *                   domainUrl: "https://myrestaurant.com"
 *                   status: in_progress
 *                   createdAt: "2026-07-01T09:00:00.000Z"
 *
 * /api/admin/domain-transfers/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Domain transfer details
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
 *                 domainUrl: "https://myrestaurant.com"
 *                 status: in_progress
 *                 messages:
 *                   - message: "Please update DNS A record"
 *                     sender: admin
 *
 * /api/admin/domain-transfers/{id}/message:
 *   post:
 *     tags: [Admin]
 *     summary: Send message on transfer
 *     description: Admin sends instructions or updates to the user.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 5 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             message: "DNS verified. Please confirm from your dashboard."
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               request:
 *                 id: 5
 *                 status: in_progress
 *
 * /api/admin/domain-transfers/{id}/complete:
 *   post:
 *     tags: [Admin]
 *     summary: Mark transfer completed
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
 *                 status: completed
 *
 * /api/admin/domain-transfers/{id}/cancel:
 *   post:
 *     tags: [Admin]
 *     summary: Cancel transfer (admin)
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
 *                 status: cancelled
 *
 * /api/admin/follow-ups/queue:
 *   get:
 *     tags: [Admin]
 *     summary: Follow-up call queue
 *     description: Users due for sales/support follow-up calls.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               queue:
 *                 - userId: 128
 *                   name: "Ahmed Hassan"
 *                   phoneNumber: "+201012345678"
 *                   reason: "Signed up, no menu created"
 *                   priority: high
 *
 * /api/admin/follow-ups/calls:
 *   get:
 *     tags: [Admin]
 *     summary: List follow-up calls
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [scheduled, completed, missed] }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               calls:
 *                 - id: 22
 *                   userId: 128
 *                   scheduledAt: "2026-07-06T14:00:00.000Z"
 *                   status: scheduled
 *                   notes: "Discuss Pro upgrade"
 *   post:
 *     tags: [Admin]
 *     summary: Schedule follow-up call
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             userId: 128
 *             scheduledAt: "2026-07-06T14:00:00.000Z"
 *             notes: "Discuss Pro upgrade"
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             example:
 *               call:
 *                 id: 22
 *                 status: scheduled
 *
 * /api/admin/follow-ups/calls/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Update follow-up call
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 22 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             status: completed
 *             outcome: "User upgraded to Pro yearly"
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Admin]
 *     summary: Delete follow-up call
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 22 }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/follow-ups/report:
 *   get:
 *     tags: [Admin]
 *     summary: Follow-up performance report
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date, example: "2026-06-01" }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date, example: "2026-07-01" }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               totalCalls: 45
 *               completed: 38
 *               conversions: 12
 *               conversionRate: 31.6
 *
 * /api/admin/broadcast/preview:
 *   get:
 *     tags: [Admin]
 *     summary: Preview email broadcast
 *     description: Renders HTML preview before sending mass email to users.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: subject
 *         schema: { type: string, example: "New Pro features" }
 *       - in: query
 *         name: body
 *         schema: { type: string }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               html: "<html>...</html>"
 *               recipientCount: 1180
 *
 * /api/admin/broadcast/send:
 *   post:
 *     tags: [Admin]
 *     summary: Send email broadcast
 *     description: Sends email to filtered user segment (all, pro, free, etc.).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             subject: "New Pro features"
 *             subjectAr: "ميزات Pro الجديدة"
 *             body: "We added menu groups..."
 *             bodyAr: "أضفنا مجموعات المنيو..."
 *             segment: pro
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               sentCount: 320
 *
 * /api/admin/activity-log:
 *   get:
 *     tags: [Admin]
 *     summary: Admin panel activity log
 *     description: Audit trail of admin actions (user edits, plan changes, etc.).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 50 }
 *       - in: query
 *         name: adminId
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               logs:
 *                 - id: 900
 *                   adminId: 1
 *                   adminName: "Super Admin"
 *                   action: "update_subscription"
 *                   targetUserId: 128
 *                   details: "Changed to Pro yearly"
 *                   createdAt: "2026-07-05T11:00:00.000Z"
 */

export {};
