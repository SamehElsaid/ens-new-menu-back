/**
 * @openapi
 * /api/staff-auth/login:
 *   post:
 *     tags: [Staff Auth]
 *     summary: Staff app login
 *     description: |
 *       Returns a JWT for menu staff plus the staff member's role and the
 *       resolved `permissions` (RBAC) for client-side gating. The token carries
 *       identity only (`staffRoleId`), not the permission list.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: "karim@restaurant.com"
 *             password: "staff123456"
 *             expoToken: "ExponentPushToken[xxxxxx]"
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Login successful"
 *               staff:
 *                 id: 7
 *                 menuId: 42
 *                 name: "Karim"
 *                 roleId: 3
 *                 roleName: "Cashier"
 *               role:
 *                 id: 3
 *                 name: "Cashier"
 *               permissions: ["dashboard:access", "orders:view", "orders:confirm", "orders:complete"]
 *               accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.staff.example"
 *       401:
 *         description: Invalid credentials
 *
 * /api/staff-auth/me:
 *   get:
 *     tags: [Staff Auth]
 *     summary: Current staff profile
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               staff:
 *                 id: 7
 *                 menuId: 42
 *                 name: "Karim"
 *                 roleId: 3
 *                 roleName: "Cashier"
 *                 email: "karim@restaurant.com"
 *               role:
 *                 id: 3
 *                 name: "Cashier"
 *               permissions: ["dashboard:access", "orders:view", "orders:confirm", "orders:complete"]
 *
 * /api/staff-auth/logout:
 *   post:
 *     tags: [Staff Auth]
 *     summary: Staff logout
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Logged out successfully"
 */

export {};
