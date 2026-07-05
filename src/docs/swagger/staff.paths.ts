/**
 * @openapi
 * /api/staff-auth/login:
 *   post:
 *     tags: [Staff Auth]
 *     summary: Staff app login
 *     description: Returns JWT for menu staff (cashier/waiter/kitchen). Use with table-call endpoints under **Orders**.
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
 *                 role: cashier
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
 *                 role: cashier
 *                 email: "karim@restaurant.com"
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
