/**
 * @openapi
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard stats
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Stats
 *
 * /api/admin/analytics:
 *   get:
 *     tags: [Admin]
 *     summary: Admin analytics
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Analytics
 *
 * /api/admin/payments:
 *   get:
 *     tags: [Admin]
 *     summary: Payment records
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Payments list
 *
 * /api/admin/domain-transfers:
 *   get:
 *     tags: [Admin]
 *     summary: List domain transfer requests
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Transfers
 *
 * /api/admin/domain-transfers/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get domain transfer by ID
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Transfer details
 *
 * /api/admin/domain-transfers/{id}/message:
 *   post:
 *     tags: [Admin]
 *     summary: Send message on transfer
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Message sent
 *
 * /api/admin/domain-transfers/{id}/complete:
 *   post:
 *     tags: [Admin]
 *     summary: Complete domain transfer
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Completed
 *
 * /api/admin/domain-transfers/{id}/cancel:
 *   post:
 *     tags: [Admin]
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
 * /api/admin/follow-ups/queue:
 *   get:
 *     tags: [Admin]
 *     summary: Follow-up queue
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Queue
 *
 * /api/admin/follow-ups/calls:
 *   get:
 *     tags: [Admin]
 *     summary: List follow-up calls
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Calls
 *   post:
 *     tags: [Admin]
 *     summary: Create follow-up call
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Created
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
 *         schema: { type: integer }
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
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/follow-ups/report:
 *   get:
 *     tags: [Admin]
 *     summary: Follow-up report
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Report
 *
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Users list
 *
 * /api/admin/broadcast/preview:
 *   get:
 *     tags: [Admin]
 *     summary: Preview email broadcast
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Preview
 *
 * /api/admin/broadcast/send:
 *   post:
 *     tags: [Admin]
 *     summary: Send email broadcast
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Sent
 *
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: User details
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User
 *   delete:
 *     tags: [Admin]
 *     summary: Hard delete user
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
 * /api/admin/users/{id}/suspend:
 *   put:
 *     tags: [Admin]
 *     summary: Toggle user suspension
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Toggled
 *
 * /api/admin/users/{id}/password:
 *   put:
 *     tags: [Admin]
 *     summary: Set user password
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/users/{id}/subscription:
 *   put:
 *     tags: [Admin]
 *     summary: Update user subscription
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/users/{id}/extra-menus:
 *   put:
 *     tags: [Admin]
 *     summary: Update extra menus count
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/users/{id}/apply-free-limits:
 *   post:
 *     tags: [Admin]
 *     summary: Apply free plan limits
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Applied
 *
 * /api/admin/users/{id}/feature-on-homepage:
 *   post:
 *     tags: [Admin]
 *     summary: Feature user on homepage
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Featured
 *   delete:
 *     tags: [Admin]
 *     summary: Unfeature user from homepage
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Unfeatured
 *
 * /api/admin/users/{id}/profile:
 *   put:
 *     tags: [Admin]
 *     summary: Patch user profile
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/users/{id}/block:
 *   put:
 *     tags: [Admin]
 *     summary: Block/unblock user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/users/{id}/soft-delete:
 *   post:
 *     tags: [Admin]
 *     summary: Soft delete user
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Soft deleted
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
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Restored
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
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Email sent
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
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Addresses
 *   post:
 *     tags: [Admin]
 *     summary: Add user address
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
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
 *         schema: { type: integer }
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema: { type: integer }
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
 *         schema: { type: integer }
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/users/{id}/notes:
 *   get:
 *     tags: [Admin]
 *     summary: List user notes
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Notes
 *   post:
 *     tags: [Admin]
 *     summary: Add user note
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/users/{id}/notes/{noteId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete user note
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/users/{id}/activity-log:
 *   get:
 *     tags: [Admin]
 *     summary: User activity log
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Activity log
 *
 * /api/admin/users/{id}/orders:
 *   get:
 *     tags: [Admin]
 *     summary: User orders
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Orders
 *
 * /api/admin/users/{id}/vouchers:
 *   get:
 *     tags: [Admin]
 *     summary: User vouchers
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vouchers
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
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Assigned
 *
 * /api/admin/users/{id}/vouchers/{voucherId}/block:
 *   post:
 *     tags: [Admin]
 *     summary: Block user voucher
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Blocked
 *   delete:
 *     tags: [Admin]
 *     summary: Unblock user voucher
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: voucherId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Unblocked
 *
 * /api/admin/users/{id}/support:
 *   get:
 *     tags: [Admin]
 *     summary: User support cases
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Support cases
 *   post:
 *     tags: [Admin]
 *     summary: Create support case
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
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
 *         schema: { type: integer }
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/plans/subscription:
 *   get:
 *     tags: [Admin]
 *     summary: Plans for subscription admin
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Plans
 *
 * /api/admin/plans:
 *   get:
 *     tags: [Admin]
 *     summary: All plans
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Plans
 *   post:
 *     tags: [Admin]
 *     summary: Create plan
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/plans/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Update plan
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
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
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Patched
 *
 * /api/admin/ads:
 *   get:
 *     tags: [Admin]
 *     summary: Global ads
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Ads
 *   post:
 *     tags: [Admin]
 *     summary: Create global ad
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/ads/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Update global ad
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Admin]
 *     summary: Delete global ad
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
 * /api/admin/ads/{id}/analytics:
 *   get:
 *     tags: [Admin]
 *     summary: Ad analytics
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Analytics
 *
 * /api/admin/activity-log:
 *   get:
 *     tags: [Admin]
 *     summary: Admin activity log
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Log
 *
 * /api/admin/admins:
 *   get:
 *     tags: [Admin]
 *     summary: List admins
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Admins
 *   post:
 *     tags: [Admin]
 *     summary: Create admin
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
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
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/admin/admins/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete admin
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
 * /api/admin/app-version:
 *   post:
 *     tags: [Admin]
 *     summary: Create app version record
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/vouchers:
 *   get:
 *     tags: [Admin]
 *     summary: List vouchers
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Vouchers
 *   post:
 *     tags: [Admin]
 *     summary: Create voucher
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/vouchers/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get voucher by ID
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Voucher
 *   patch:
 *     tags: [Admin]
 *     summary: Update voucher
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
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
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/vouchers/{id}/redemptions:
 *   get:
 *     tags: [Admin]
 *     summary: Voucher redemptions
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Redemptions
 */

export {};
