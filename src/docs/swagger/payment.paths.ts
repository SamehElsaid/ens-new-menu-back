/**
 * @openapi
 * /api/payment/initiate:
 *   post:
 *     tags: [Payment]
 *     summary: Initiate generic payment
 *     security: [{ ApiKeyAuth: [] }]
 *     responses:
 *       200:
 *         description: Payment URL / order
 *
 * /api/payment/subscription/pro-yearly/initiate:
 *   post:
 *     tags: [Payment]
 *     summary: Initiate Pro yearly subscription payment
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Payment initiated
 *
 * /api/payment/subscription/pro-monthly/initiate:
 *   post:
 *     tags: [Payment]
 *     summary: Initiate Pro monthly subscription payment
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Payment initiated
 *
 * /api/payment/subscription/extra-menus/initiate:
 *   post:
 *     tags: [Payment]
 *     summary: Purchase extra menus
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Payment initiated
 *
 * /api/payment/easykash/callback:
 *   post:
 *     tags: [Payment]
 *     summary: EasyKash webhook (HMAC verified)
 *     security: []
 *     responses:
 *       200:
 *         description: Callback processed
 *
 * /api/payment/redirect:
 *   get:
 *     tags: [Payment]
 *     summary: EasyKash redirect handler
 *     security: []
 *     responses:
 *       302:
 *         description: Redirect to frontend
 *
 * /api/payment/{order_id}/status:
 *   get:
 *     tags: [Payment]
 *     summary: Get payment status
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: order_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Payment status
 *
 * /api/vouchers/validate:
 *   post:
 *     tags: [Vouchers]
 *     summary: Validate voucher code
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Validation result
 *
 * /api/vouchers/redeem-duration:
 *   post:
 *     tags: [Vouchers]
 *     summary: Redeem duration voucher
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Redeemed
 *
 * /api/upload:
 *   post:
 *     tags: [Upload]
 *     summary: Upload image (multipart)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               type:
 *                 type: string
 *                 enum: [logos, menu-items, ads, profile-images]
 *     responses:
 *       200:
 *         description: Upload URL
 *
 * /api/upload/{filename}:
 *   delete:
 *     tags: [Upload]
 *     summary: Delete uploaded image
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string, pattern: '^[a-f0-9-]+\\.webp$' }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [logos, menu-items, ads] }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/upload/{filename}/info:
 *   get:
 *     tags: [Upload]
 *     summary: Get image metadata
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Image info
 *
 * /api/structure/image/:
 *   post:
 *     tags: [Structure]
 *     summary: Upload structure image
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Uploaded
 */

export {};
