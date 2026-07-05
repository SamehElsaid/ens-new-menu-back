/**
 * @openapi
 * /api/menus/{menuId}/staff:
 *   get:
 *     tags: [Staff]
 *     summary: List menu staff
 *     description: |
 *       Staff accounts for the mobile staff app (table/delivery orders).
 *       **Pro plan** required. Staff login: `POST /api/staff-auth/login`.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               staff:
 *                 - id: 7
 *                   menuId: 42
 *                   name: "Karim"
 *                   role: cashier
 *                   email: "karim@restaurant.com"
 *                   phone: "+201012345678"
 *                   isActive: true
 *
 *   post:
 *     tags: [Staff]
 *     summary: Create staff member
 *     description: Optional password (min 6) enables staff app login with email.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             name: "Karim"
 *             role: cashier
 *             email: "karim@restaurant.com"
 *             phone: "+201012345678"
 *             password: "staff123456"
 *             isActive: true
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             example:
 *               message: "Staff created successfully"
 *               staffId: 7
 *
 * /api/menus/{menuId}/staff/{staffId}:
 *   get:
 *     tags: [Staff]
 *     summary: Get staff member
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema: { type: integer, example: 7 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               staff:
 *                 id: 7
 *                 name: "Karim"
 *                 role: cashier
 *                 email: "karim@restaurant.com"
 *                 isActive: true
 *   put:
 *     tags: [Staff]
 *     summary: Update staff member
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema: { type: integer, example: 7 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             role: waiter
 *             isActive: true
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Staff updated successfully"
 *   delete:
 *     tags: [Staff]
 *     summary: Delete staff member
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema: { type: integer, example: 7 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Staff deleted successfully"
 */

export {};
