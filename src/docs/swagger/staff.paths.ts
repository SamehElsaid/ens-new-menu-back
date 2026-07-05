/**
 * @openapi
 * /api/verifykit/start:
 *   post:
 *     tags: [VerifyKit]
 *     summary: Start WhatsApp verification (deeplink/QR)
 *     security: [{ ApiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Session reference & deeplink
 *
 * /api/verifykit/check:
 *   post:
 *     tags: [VerifyKit]
 *     summary: Poll verification status
 *     security: [{ ApiKeyAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Validation status
 *
 * /api/verifykit/result:
 *   post:
 *     tags: [VerifyKit]
 *     summary: Get verified phone from session
 *     security: [{ ApiKeyAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Phone result
 *
 * /api/verifykit/complete:
 *   post:
 *     tags: [VerifyKit]
 *     summary: Save verified phone to user profile
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Phone saved
 *
 * /api/staff-auth/login:
 *   post:
 *     tags: [Staff Auth]
 *     summary: Staff login
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               expoToken: { type: string }
 *     responses:
 *       200:
 *         description: Staff JWT
 *
 * /api/staff-auth/me:
 *   get:
 *     tags: [Staff Auth]
 *     summary: Current staff profile
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Staff data
 *
 * /api/staff-auth/table-calls/history:
 *   get:
 *     tags: [Staff Auth]
 *     summary: Table call history
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 500 }
 *     responses:
 *       200:
 *         description: Paginated history
 *
 * /api/staff-auth/table-calls:
 *   get:
 *     tags: [Staff Auth]
 *     summary: Pending table calls
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Pending calls list
 *
 * /api/staff-auth/table-calls/{id}:
 *   get:
 *     tags: [Staff Auth]
 *     summary: Get single table call
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Call details
 *   put:
 *     tags: [Staff Auth]
 *     summary: Replace items & status
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items: { type: array, items: { type: object } }
 *               status: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/staff-auth/table-calls/{id}/status:
 *   patch:
 *     tags: [Staff Auth]
 *     summary: Update call status (confirmed/cancelled)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [confirmed, cancelled] }
 *     responses:
 *       200:
 *         description: Status updated
 *
 * /api/staff-auth/table-calls/{id}/items:
 *   patch:
 *     tags: [Staff Auth]
 *     summary: Edit cart items
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Items updated
 *
 * /api/staff-auth/table-calls/{id}/complete:
 *   patch:
 *     tags: [Staff Auth]
 *     summary: Complete table order
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
 * /api/staff-auth/logout:
 *   post:
 *     tags: [Staff Auth]
 *     summary: Staff logout
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Logged out
 */

export {};
